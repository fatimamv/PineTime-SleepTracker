import os
import pandas as pd
import numpy as np
import json
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
