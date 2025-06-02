import os
import json

import numpy as np
import pandas as pd
import neurokit2 as nk
import pyhrv
from postgrest import AsyncPostgrestClient

# Cole-Kripke weights (original paper):
_CK_WEIGHTS = np.array([0.0004, 0.004, 0.02, 0.1, 0.02, 0.004, 0.0004])
_CK_THRESHOLD = 0.3

async def process_sleep_record(rec_id: int, supabase: AsyncPostgrestClient):
    # 1) Leer datos crudos
    resp = await supabase.from_("raw_sensor_data") \
                .select("sensor_type,value,captured_at") \
                .eq("sleep_record_id", rec_id) \
                .execute()
    df = pd.DataFrame(resp.data)
    df["ts"] = pd.to_datetime(df["captured_at"])

    # 2) Acelerómetro → actividad en bins de 60 s
    accel_raw = df[df.sensor_type == "accelerometer"]
    if accel_raw.empty:
        print("There is no accelerometer data for this record.")
        return

    # Extraer eje x o magnitud del movimiento
    accel = (accel_raw
            .assign(magnitude=lambda d: d.value.map(lambda v: np.sqrt(sum([json.loads(v).get(k, 0)**2 for k in ['x', 'y', 'z']]))))
            .set_index("ts").magnitude.resample("60s").mean().fillna(0.0))
    vals = accel.to_numpy()

    if len(vals) < len(_CK_WEIGHTS):
        print(f"Not enough data to apply Cole-Kripke: {len(vals)} values.")
        return

    print(f"Accelerometer bins (60s): {len(accel)} values")

    # Convolución + umbral
    scores = np.convolve(vals, _CK_WEIGHTS, mode="same")
    sleep_wake = pd.Series((scores < _CK_THRESHOLD).astype(int), index=accel.index)

    print(f"Scores (Cole-Kripke): {len(scores)} values")
    print("CK Score stats:", scores.min(), scores.max())
    print("Sleep wake counts:", sleep_wake.value_counts())
    print("Cole-Kripke scores:", scores[:10])  # muestra los primeros 10

    # 4) Métricas de sueño
    sol_seconds   = int((sleep_wake.idxmax() - sleep_wake.index[0]).total_seconds())
    waso_minutes  = int((sleep_wake == 0).sum())
    frag_index    = float(sleep_wake.diff().abs().sum() / len(sleep_wake))

    # 5) Ritmo cardiaco → HRV
    hr = (df[df.sensor_type == "heart_rate"]
            .assign(hr=lambda d: d.value.map(lambda v: json.loads(v)["heartRate"]))
            .set_index("ts").hr.resample("1s").ffill())
    ibi = 60000.0 / hr
    rri = pd.to_numeric(ibi.dropna(), errors="coerce").dropna().to_numpy()
    if not np.issubdtype(rri.dtype, np.number) or len(rri) < 3:
        print("❌ Invalid or too short RRI:", rri)
        return
    peaks = nk.intervals_to_peaks(rri, sampling_rate=1)
    hrv = nk.hrv_time(peaks=peaks, sampling_rate=1)

    rmssd = float(hrv["HRV_RMSSD"].item())
    sdnn = float(hrv["HRV_SDNN"].item())

    print(f"SOL: {sol_seconds}s, WASO: {waso_minutes}min, Frag: {frag_index}")
    print(f"HRV_RMSSD: {hrv['HRV_RMSSD']}, HRV_SDNN: {hrv['HRV_SDNN']}")

    def safe_float(val):
        try:
            return float(val.item()) if hasattr(val, "item") else float(val)
        except Exception:
            return None 

    metrics = {
        "sleep_record_id": rec_id,
        "sol_seconds": int(sol_seconds) if pd.notna(sol_seconds) else None,
        "waso_minutes": int(waso_minutes) if pd.notna(waso_minutes) else None,
        "fragmentation_index": float(frag_index) if pd.notna(frag_index) else None,
        "hrv_rmssd": safe_float(hrv["HRV_RMSSD"]),
        "hrv_sdnn": safe_float(hrv["HRV_SDNN"]),
    }

    print("Inserting metrics:", metrics)

    await supabase.from_("sleep_metrics").insert(metrics).execute()

        # 6) Estimación de etapas de sueño: wake, light, deep
    if hr.empty or len(hr) != len(sleep_wake):
        print("No HR data or HR length mismatch, skipping sleep stage estimation.")
        return

    # Asegúrate de que ambos índices estén ordenados
    hr = hr.sort_index()
    sleep_wake = sleep_wake.sort_index()

    # Alinea tomando el valor más cercano
    hr_aligned = hr.reindex(sleep_wake.index, method="nearest", tolerance=pd.Timedelta("30s"))

    percentiles = np.percentile(hr_aligned.values, [25, 50])

    def classify_stage(row):
        awake = sleep_wake.loc[row.name] == 0
        if awake:
            return "wake"
        elif row < percentiles[0]:
            return "deep"
        else:
            return "light"

    stages = hr_aligned.apply(classify_stage)

    # Convert to list of intervals
    results = []
    current_stage = None
    start_time = None
    for ts, stage in stages.items():
        if stage != current_stage:
            if current_stage is not None:
                results.append({
                    "sleep_record_id": rec_id,
                    "stage": current_stage,
                    "start_time": start_time,
                    "end_time": ts
                })
            current_stage = stage
            start_time = ts

    # Cierra último segmento
    if current_stage is not None and start_time is not None:
        results.append({
            "sleep_record_id": rec_id,
            "stage": current_stage,
            "start_time": start_time,
            "end_time": stages.index[-1]
        })

    print("Inserting sleep stages:", results[:3])
    await supabase.from_("sleep_stages").insert(results).execute()
