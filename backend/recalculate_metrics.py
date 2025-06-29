#!/usr/bin/env python3
"""
Script to recalculate sleep metrics for existing records using the new movement-based algorithm.
"""

import asyncio
import os
from postgrest import AsyncPostgrestClient
from main import process_sleep_record

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://your-project.supabase.co')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'your-anon-key')

async def recalculate_metrics():
    """Recalculate metrics for all sleep records with accelerometer data."""
    
    # Initialize Supabase client
    supabase = AsyncPostgrestClient(
        f"{SUPABASE_URL}/rest/v1",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
    )
    
    try:
        # Get all sleep records with accelerometer data
        response = await supabase.from_("raw_sensor_data") \
            .select("sleep_record_id") \
            .eq("sensor_type", "accelerometer") \
            .execute()
        
        if not response.data:
            print("❌ No accelerometer data found")
            return
        
        # Get unique sleep record IDs
        record_ids = list(set([item["sleep_record_id"] for item in response.data]))
        record_ids.sort()
        
        print(f"🔄 Found {len(record_ids)} sleep records with accelerometer data")
        print(f"📋 Record IDs: {record_ids}")
        
        # Process each record
        for i, record_id in enumerate(record_ids, 1):
            print(f"\n🔄 Processing record {i}/{len(record_ids)}: {record_id}")
            try:
                await process_sleep_record(record_id, supabase)
                print(f"✅ Successfully processed record {record_id}")
            except Exception as e:
                print(f"❌ Error processing record {record_id}: {e}")
                continue
        
        print(f"\n🎉 Completed processing {len(record_ids)} records")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(recalculate_metrics()) 