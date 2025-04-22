import os, json, pandas as pd
from supabase import create_client
import pyActigraphy as act
import neurokit2 as nk
import pyhrv

url = os.getenv("SUPABASE_URL"); key = os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

def process_sleep_record(rec_id: int):
    raw = supabase.table("raw_sensor_data")\
                  .select("sensor_type,value,captured_at")\
                  .eq("sleep_record_id", rec_id).execute().data
    df = pd.DataFrame(raw)
    df["ts"] = pd.to_datetime(df["captured_at"])

    # ------------- 1) Acelerómetro → serie de actividad
    accel = (df[df.sensor_type=="accelerometer"]
             .assign(x=lambda d: d.value.apply(lambda v: json.loads(v)["x"]))
             .set_index("ts").x)
    # 60‑s bins (Cole‑Kripke usa 1 min)
    activity = accel.resample("60s").apply(lambda x: x.abs().mean())

    acti = act.Actigraphy(activity)
    sleep_wake = acti.sleep_wake_cole_kripke()          # binario 1 = sleep
    sol = (sleep_wake.idxmax() - sleep_wake.index[0]).seconds

    waso = acti.waso()                                  # minutos wake after sleep onset
    frag = acti.fragmentation_index()

    # ------------- 2) HR → HRV
    hr = (df[df.sensor_type=="heart_rate"]
          .assign(hr=lambda d: d.value.apply(lambda v: json.loads(v)["heartRate"]))
          .set_index("ts").hr.resample("1s").ffill())   # upsample a 1 Hz
    ibi = 60000 / hr
    hrv = nk.hrv_time(ibi.dropna().values, sampling_rate=1)

    # ------------- 3) Guardar métricas
    supabase.table("sleep_metrics").upsert({
        "sleep_record_id": rec_id,
        "sol_seconds": sol,
        "waso_minutes": int(waso),
        "fragmentation_index": float(frag),
        "hrv_rmssd": float(hrv["HRV_RMSSD"]),
        "hrv_sdnn":  float(hrv["HRV_SDNN"]),
    }).execute()
