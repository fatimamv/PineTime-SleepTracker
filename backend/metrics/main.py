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
    accel = (df[df.sensor_type == "accelerometer"]
                .assign(x=lambda d: d.value.map(lambda v: json.loads(v)["x"]))
                .set_index("ts").x.resample("60s").mean().fillna(0.0))
    vals = accel.to_numpy()

    # 3) Cole-Kripke: convolución + umbral
    #    usamos 'same' para que tenga la misma longitud y timestamp
    scores = np.convolve(vals, _CK_WEIGHTS, mode="same")
    # sleep=1 si score < umbral
    sleep_wake = pd.Series((scores < _CK_THRESHOLD).astype(int), index=accel.index)

    # 4) Métricas de sueño
    sol_seconds   = int((sleep_wake.idxmax() - sleep_wake.index[0]).total_seconds())
    waso_minutes  = int((sleep_wake == 0).sum())
    frag_index    = float(sleep_wake.diff().abs().sum() / len(sleep_wake))

    # 5) Ritmo cardiaco → HRV
    hr = (df[df.sensor_type == "heart_rate"]
            .assign(hr=lambda d: d.value.map(lambda v: json.loads(v)["heartRate"]))
            .set_index("ts").hr.resample("1s").ffill())
    ibi = 60000.0 / hr
    hrv = nk.hrv_time(ibi.dropna().to_numpy(), sampling_rate=1)

    # 6) Guardar métricas
    await supabase.from_("sleep_metrics").upsert({
        "sleep_record_id":       rec_id,
        "sol_seconds":           sol_seconds,
        "waso_minutes":          waso_minutes,
        "fragmentation_index":   frag_index,
        "hrv_rmssd":             float(hrv["HRV_RMSSD"]),
        "hrv_sdnn":              float(hrv["HRV_SDNN"]),
    }).execute()
