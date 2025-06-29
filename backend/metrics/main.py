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
    resp = await supabase.from_("raw_sensor_data") \
                .select("sensor_type,value,captured_at") \
                .eq("sleep_record_id", rec_id) \
                .execute()

    is_valid = False
    sol_seconds = waso_minutes = frag_index = tst_minutes = hrv_rmssd = hrv_sdnn = total_sleep_time = None

    def safe_float(val):
        try:
            return float(val.item()) if hasattr(val, "item") else float(val)
        except Exception:
            return None 

    df = pd.DataFrame(resp.data)
    if df.empty:
        print(f"❌ No raw_sensor_data found for sleep_record_id {rec_id}")
    else:
        df["ts"] = pd.to_datetime(df["captured_at"])
        accel_raw = df[df.sensor_type == "accelerometer"]
    

        if accel_raw.empty:
            print("There is no accelerometer data for this record.")
        else:
            accel = (accel_raw
                .assign(
                    # Extract movement information from the enhanced data
                    movement_detected=lambda d: d.value.map(lambda v: json.loads(v).get('movement_detected', False)),
                    movement_magnitude=lambda d: d.value.map(lambda v: json.loads(v).get('movement_magnitude', 0.0)),
                    movement_delta=lambda d: d.value.map(lambda v: json.loads(v).get('movement_delta', 0.0)),
                    # Fallback to magnitude if movement data not available
                    magnitude=lambda d: d.value.map(lambda v: np.sqrt(sum([json.loads(v).get(k, 0)**2 for k in ['x', 'y', 'z']])))
                )
                .set_index("ts"))
            
            # Create movement score based on detected movements
            movement_score = (accel
                .assign(
                    score=lambda d: np.where(
                        d.movement_detected,
                        d.movement_magnitude * 3.0, 
                        d.movement_delta * 2.0      
                    )
                )
                .score
                .resample("60s")
                .mean()
                .fillna(0.0))
            
            vals = movement_score.to_numpy()

            print(f"Movement-based accelerometer bins (60s): {len(movement_score)} values")
            print(f"Movement score stats: min={vals.min():.3f}, max={vals.max():.3f}, mean={vals.mean():.3f}")
            print(f"Movement score values: {vals[:10]}")  # Show first 10 values
            print(f"Movement score unique values: {np.unique(vals)}")  # Show all unique values
            
            if len(vals) >= len(_CK_WEIGHTS):
                is_valid = True
                
                # Check if data is constant (all values are the same)
                is_constant_data = np.allclose(vals, vals[0], rtol=1e-10)
                print(f"Data is constant: {is_constant_data}")
                if is_constant_data:
                    print(f"Constant value: {vals[0]:.6f}")
                
                scores = np.convolve(vals, _CK_WEIGHTS, mode="same")
                
                # For constant data, ensure scores are also constant
                if is_constant_data:
                    expected_score = vals[0] * np.sum(_CK_WEIGHTS)
                    print(f"Expected constant score: {expected_score:.6f}")
                    print(f"Actual scores min/max: {scores.min():.6f}/{scores.max():.6f}")
                    
                    # If scores are not constant due to convolution artifacts, use the expected value
                    if not np.allclose(scores, expected_score, rtol=1e-10):
                        print("⚠️ Convolution artifacts detected, using constant score")
                        scores = np.full_like(scores, expected_score)
                
                adjusted_threshold = min(_CK_THRESHOLD * 0.3, vals.mean() * 1.0)
                
                # For constant data with no movement, use a higher threshold
                if is_constant_data and vals[0] < 1.0:  # If constant and low movement
                    adjusted_threshold = _CK_THRESHOLD * 0.5  # Use a higher threshold
                    print(f"Using higher threshold for constant data: {adjusted_threshold:.3f}")
                
                sleep_wake = pd.Series((scores >= adjusted_threshold).astype(int), index=movement_score.index)

                classification_data = [
                    {
                        "sleep_record_id": rec_id,
                        "timestamp": ts.isoformat(),
                        "state": int(state)
                    }
                    for ts, state in sleep_wake.items()
                ]

                await supabase.from_("sleep_classification").insert(classification_data).execute()
                print("Inserted Cole-Kripke sleep classification (movement-based).")

                tst_minutes = int((sleep_wake == 0).sum())  # FIXED: Count sleep periods (state == 0)

                print(f"Scores (Cole-Kripke): {len(scores)} values")
                print("CK Score stats:", scores.min(), scores.max())
                print("Sleep wake counts:", sleep_wake.value_counts())
                print("Cole-Kripke scores:", scores[:10])  
                print(f"TST: {tst_minutes} minutes")
                print(f"Adjusted threshold: {adjusted_threshold:.3f}")

                # Sleep metrics
                sol_seconds   = int((sleep_wake.idxmax() - sleep_wake.index[0]).total_seconds())
                waso_minutes  = int((sleep_wake == 1).sum())  # FIXED: Count wake periods (state == 1)
                frag_index    = float(sleep_wake.diff().abs().sum() / len(sleep_wake))
                
                print(f"SOL: {sol_seconds}s, WASO: {waso_minutes}min, Frag: {frag_index}")
            else: 
                print("❌ Not enough accelerometer data for Cole-Kripke")

            # Heart rate → HRV
            if df[df.sensor_type == "heart_rate"].empty:
                print("❌ No heart_rate data found for this record")
            else:
                hr = (df[df.sensor_type == "heart_rate"]
                        .assign(hr=lambda d: d.value.map(lambda v: json.loads(v)["heartRate"]))
                        .set_index("ts").hr.resample("1s").ffill())
                ibi = 60000.0 / hr
                rri = pd.to_numeric(ibi.dropna(), errors="coerce").dropna().to_numpy()
                if not np.issubdtype(rri.dtype, np.number) or len(rri) < 3:
                    print("❌ Invalid or too short RRI:", rri)
                else:
                    rri = [x for x in rri if np.isfinite(x) and x > 300 and x < 2000]  # filtra valores extremos y absurdos
                    if len(rri) < 3:
                        print("Not enough valid RRI values after filtering.")
                    else: 
                        peaks = nk.intervals_to_peaks(rri, sampling_rate=1)
                        hrv = nk.hrv_time(peaks=peaks, sampling_rate=1)

                        rmssd = float(hrv["HRV_RMSSD"].item())
                        sdnn = float(hrv["HRV_SDNN"].item())
                        print(f"HRV_RMSSD: {hrv['HRV_RMSSD']}, HRV_SDNN: {hrv['HRV_SDNN']}")

                        hrv_rmssd = safe_float(hrv["HRV_RMSSD"])
                        hrv_sdnn = safe_float(hrv["HRV_SDNN"])

    metrics = {
        "sleep_record_id": rec_id,
        "sol_seconds": int(sol_seconds) if pd.notna(sol_seconds) and is_valid else None,
        "waso_minutes": int(waso_minutes) if pd.notna(waso_minutes) and is_valid else None,
        "fragmentation_index": float(frag_index) if pd.notna(frag_index) and is_valid else None,
        "hrv_rmssd": hrv_rmssd,
        "hrv_sdnn": hrv_sdnn,
        "total_sleep_time": int(tst_minutes) if pd.notna(tst_minutes) and is_valid else None,   
        "is_valid": is_valid
    }

    print("Inserting metrics:", metrics)

    await supabase.from_("sleep_metrics").insert(metrics).execute()

    if is_valid:
        print("HR length:", len(hr))
        print("Sleep wake length:", len(sleep_wake))

        # Sleep stage estimation: wake, light, deep
        if hr.empty:
            print("No HR data, skipping sleep stage estimation.")
            return

        # Ensure both indices are sorted
        hr = hr.sort_index()
        sleep_wake = sleep_wake.sort_index()

        # Align heart rate to accelerometer timestamps
        hr_aligned = hr.reindex(sleep_wake.index, method="nearest", tolerance=pd.Timedelta("15s"))

        # Remove the ones that couldn't be aligned
        valid_idx = hr_aligned.dropna().index
        hr_aligned = hr_aligned.loc[valid_idx]
        sleep_wake_valid = sleep_wake.loc[valid_idx]

        print(f"HR length after alignment: {len(hr_aligned)}")
        print(f"Sleep wake length after filtering: {len(sleep_wake_valid)}")

        # Percentiles to classify into deep/light
        percentiles = np.percentile(hr_aligned.values, [25, 50])

        def classify_stage(ts, value):
            awake = sleep_wake_valid.loc[ts] == 1  # FIXED: state == 1 means awake
            if awake:
                return "wake"
            elif value < percentiles[0]:
                return "deep"
            else:
                return "light"


        stages = pd.Series(
            [classify_stage(ts, val) for ts, val in hr_aligned.items()],
            index=hr_aligned.index
        )

        # Convert to list of intervals
        results = []
        current_stage = None
        start_time = None
        for ts, stage in stages.items():
            if stage != current_stage:
                if current_stage is not None:
                    # Ensure minimum duration of 1 minute
                    duration_seconds = (ts - start_time).total_seconds()
                    if duration_seconds >= 60:
                        results.append({
                            "sleep_record_id": rec_id,
                            "stage": current_stage,
                            "start_time": start_time,
                            "end_time": ts
                        })
                    else:
                        print(f"⚠️ Skipping short stage: {current_stage} from {start_time} to {ts} (duration: {duration_seconds:.1f}s)")
                current_stage = stage
                start_time = ts

        # Close last segment
        if current_stage is not None and start_time is not None:
            # Ensure the last stage has a proper end time
            last_end_time = stages.index[-1]
            if last_end_time <= start_time:
                # If the last timestamp is the same as start_time, add 1 minute
                last_end_time = start_time + pd.Timedelta(minutes=1)
                print(f"⚠️ Adjusted last stage end time from {stages.index[-1]} to {last_end_time}")
            
            # Ensure minimum duration of 1 minute
            duration_seconds = (last_end_time - start_time).total_seconds()
            if duration_seconds >= 60:
                results.append({
                    "sleep_record_id": rec_id,
                    "stage": current_stage,
                    "start_time": start_time,
                    "end_time": last_end_time
                })
            else:
                print(f"⚠️ Skipping short last stage: {current_stage} from {start_time} to {last_end_time} (duration: {duration_seconds:.1f}s)")

        #Convert Timestamps to ISO strings for Supabase
        for result in results:
            result["start_time"] = result["start_time"].isoformat()
            result["end_time"] = result["end_time"].isoformat()

        print("Inserting sleep stages:", results[:3])
        await supabase.from_("sleep_stages").insert(results).execute()  
    else:
        print("❌ Not enough data to insert sleep stages") 
        await supabase.from_("sleep_stages").insert({
            "sleep_record_id": rec_id, 
            "stage": "invalid",
            "start_time": None,
            "end_time": None
        }).execute()  