from fastapi import FastAPI
from pydantic import BaseModel
import os
from supabase import create_client
from .main import process_sleep_record

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")
supabase = create_client(url, key)

class Payload(BaseModel):
    sleep_record_id: int

app = FastAPI()

@app.post("/compute")
def compute(payload: Payload):
    process_sleep_record(payload.sleep_record_id, supabase)
    return {"status": "ok"}
