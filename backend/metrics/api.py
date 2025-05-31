import os
from fastapi import FastAPI
from pydantic import BaseModel
from postgrest import AsyncPostgrestClient
from .main import process_sleep_record
from .sleep_stages import estimate_sleep_stages 

URL = os.getenv("SUPABASE_URL") + "/rest/v1/"
KEY = os.getenv("SUPABASE_SERVICE_KEY")
supabase = AsyncPostgrestClient(URL, headers={
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}"
})
supabase.auth(KEY)

class Payload(BaseModel):
    sleep_record_id: int

app = FastAPI()

@app.post("/compute")
async def compute(payload: Payload):
    await process_sleep_record(payload.sleep_record_id, supabase)
    return {"status": "ok"}

@app.post("/stages")
async def stages(payload: Payload):
    # 1. Obtain data from Supabase (same as in process_sleep_record)
    resp = await supabase.from_("raw_sensor_data") \
                .select("sensor_type,value,captured_at") \
                .eq("sleep_record_id", payload.sleep_record_id) \
                .execute()
    df = pd.DataFrame(resp.data)
    df["ts"] = pd.to_datetime(df["captured_at"])

    # 2. Process accelerometer
    accel_raw = df[df.sensor_type == "accelerometer"]
    accel = (accel_raw
        .assign(magnitude=lambda d: d.value.map(lambda v: np.sqrt(sum([json.loads(v).get(k, 0)**2 for k in ['x', 'y', 'z']]))))
        .set_index("ts").magnitude.resample("60s").mean().fillna(0.0))

    # 3. Call pyActigraphy
    labels = estimate_sleep_stages(accel)

    # 4. Return first results as JSON
    return {
        "sleep_record_id": payload.sleep_record_id,
        "sample": labels.head(10).to_dict()
    }
