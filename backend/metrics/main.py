import os
import json

import numpy as np
import pandas as pd
import neurokit2 as nk
import pyhrv
from postgrest import AsyncPostgrestClient

# Cole-Kripke weights (original paper):
_CK_WEIGHTS = np.array([0.0004, 0.004, 0.02, 0.1, 0.02, 0.004, 0.0004])
_CK_THRESHOLD = 1.0

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
            .assign(x=lambda d: d.value.map(lambda v: json.loads(v).get("x", 0)))
            .set_index("ts").x.resample("60s").mean().fillna(0.0))
    vals = accel.to_numpy()

    if len(vals) < len(_CK_WEIGHTS):
        print(f"Not enough data to apply Cole-Kripke: {len(vals)} values.")
        return

    print(f"Accelerometer bins (60s): {len(accel)} values")

    # Convolución + umbral
    scores = np.convolve(vals, _CK_WEIGHTS, mode="same")
    sleep_wake = pd.Series((scores < _CK_THRESHOLD).astype(int), index=accel.index)

    print(f"Scores (Cole-Kripke): {len(scores)} values")

    # 4) Métricas de sueño
    sol_seconds   = int((sleep_wake.idxmax() - sleep_wake.index[0]).total_seconds())
    waso_minutes  = int((sleep_wake == 0).sum())
    frag_index    = float(sleep_wake.diff().abs().sum() / len(sleep_wake))

    # 5) Ritmo cardiaco → HRV
    hr = (df[df.sensor_type == "heart_rate"]
            .assign(hr=lambda d: d.value.map(lambda v: json.loads(v)["heartRate"]))
            .set_index("ts").hr.resample("1s").ffill())
    ibi = 60000.0 / hr
    rri = ibi.dropna().to_numpy()
    peaks = nk.intervals_to_peaks(rri, sampling_rate=1)
    hrv = nk.hrv_time(peaks=peaks, sampling_rate=1)

    rmssd = float(hrv["HRV_RMSSD"].item())
    sdnn = float(hrv["HRV_SDNN"].item())

    print(f"SOL: {sol_seconds}s, WASO: {waso_minutes}min, Frag: {frag_index}")
    print(f"HRV_RMSSD: {hrv['HRV_RMSSD']}, HRV_SDNN: {hrv['HRV_SDNN']}")

    if any(pd.isna(x) for x in [sol_seconds, waso_minutes, frag_index, rmssd, sdnn]):
        print("❌ There is at least one metric in NaN. It will not be inserted.")
        return

    metrics = {
        "sleep_record_id": rec_id,
        "sol_seconds": sol_seconds,
        "waso_minutes": waso_minutes,
        "fragmentation_index": frag_index,
        "hrv_rmssd": rmssd,
        "hrv_sdnn": sdnn,
    }

    print("Inserting metrics:", metrics)

    await supabase.from_("sleep_metrics").insert(metrics).execute()