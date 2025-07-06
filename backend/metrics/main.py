import os
import json

import numpy as np
import pandas as pd
import neurokit2 as nk
import pyhrv
from postgrest import AsyncPostgrestClient

# Cole-Kripke algorithm weights for sleep-wake classification
# These weights are applied in a 7-minute sliding window (3 minutes before, current minute, 3 minutes after)
_CK_WEIGHTS = np.array([0.0004, 0.004, 0.02, 0.1, 0.02, 0.004, 0.0004])
_CK_THRESHOLD = 0.3  # Original threshold from Cole-Kripke paper

async def process_sleep_record(rec_id: int, supabase: AsyncPostgrestClient):
    """
    Main function to process sleep metrics for a given sleep record ID.
    
    This function performs the following steps:
    1. Extracts raw sensor data (accelerometer and heart rate)
    2. Applies Cole-Kripke algorithm for sleep-wake classification
    3. Calculates sleep quality metrics (SOL, WASO, TST, Fragmentation Index)
    4. Computes Heart Rate Variability (HRV) metrics
    5. Estimates sleep stages (wake, light, deep)
    6. Stores all results in the database
    
    Args:
        rec_id (int): Sleep record ID to process
        supabase (AsyncPostgrestClient): Supabase client for database operations
    """
    
    # Fetch raw sensor data from database
    resp = await supabase.from_("raw_sensor_data") \
                .select("sensor_type,value,captured_at") \
                .eq("sleep_record_id", rec_id) \
                .execute()

    # Initialize variables for sleep metrics
    is_valid = False
    sol_seconds = waso_minutes = frag_index = tst_minutes = hrv_rmssd = hrv_sdnn = total_sleep_time = None

    def safe_float(val):
        """
        Safely convert a value to float, handling numpy types and exceptions.
        
        Args:
            val: Value to convert
            
        Returns:
            float or None: Converted value or None if conversion fails
        """
        try:
            return float(val.item()) if hasattr(val, "item") else float(val)
        except Exception:
            return None 

    # Convert response to DataFrame and process timestamps
    df = pd.DataFrame(resp.data)
    if df.empty:
        print(f"❌ No raw_sensor_data found for sleep_record_id {rec_id}")
    else:
        # Parse timestamps with flexible format to handle different timestamp formats
        df["ts"] = pd.to_datetime(df["captured_at"], format='mixed')
        
        # Extract accelerometer data for movement analysis
        accel_raw = df[df.sensor_type == "accelerometer"]
    

        if accel_raw.empty:
            print("There is no accelerometer data for this record.")
        else:
            # Process accelerometer data to extract movement information
            accel = (accel_raw
                .assign(
                    # Extract enhanced movement data if available (from smartwatch processing)
                    movement_detected=lambda d: d.value.map(lambda v: json.loads(v).get('movement_detected', False)),
                    movement_magnitude=lambda d: d.value.map(lambda v: json.loads(v).get('movement_magnitude', 0.0)),
                    movement_delta=lambda d: d.value.map(lambda v: json.loads(v).get('movement_delta', 0.0)),
                    # Fallback: calculate magnitude from raw x,y,z axes if enhanced data not available
                    magnitude=lambda d: d.value.map(lambda v: np.sqrt(sum([json.loads(v).get(k, 0)**2 for k in ['x', 'y', 'z']])))
                )
                .set_index("ts"))
            
            # Create movement score for Cole-Kripke algorithm
            # Higher weight for detected movements, lower weight for movement deltas
            movement_score = (accel
                .assign(
                    score=lambda d: np.where(
                        d.movement_detected,
                        d.movement_magnitude * 3.0,  # Higher weight for explicit movements
                        d.movement_delta * 2.0       # Lower weight for subtle changes
                    )
                )
                .score
                .resample("60s")  # Resample to 1-minute intervals (required for Cole-Kripke)
                .mean()
                .fillna(0.0))
            
            vals = movement_score.to_numpy()

            print(f"Movement-based accelerometer bins (60s): {len(movement_score)} values")
            print(f"Movement score stats: min={vals.min():.3f}, max={vals.max():.3f}, mean={vals.mean():.3f}")
            print(f"Movement score values: {vals[:10]}")  # Show first 10 values
            print(f"Movement score unique values: {np.unique(vals)}")  # Show all unique values
            
            # Check if we have enough data for Cole-Kripke algorithm (minimum 7 minutes)
            if len(vals) >= len(_CK_WEIGHTS):
                is_valid = True
                
                # Detect if data is constant (all values are the same)
                # This can happen with very still sleep or sensor issues
                is_constant_data = np.allclose(vals, vals[0], rtol=1e-10)
                print(f"Data is constant: {is_constant_data}")
                if is_constant_data:
                    print(f"Constant value: {vals[0]:.6f}")
                
                # Apply Cole-Kripke algorithm: convolve movement scores with weights
                # This creates a smoothed score that considers temporal context
                scores = np.convolve(vals, _CK_WEIGHTS, mode="same")
                
                # Handle constant data to avoid convolution artifacts
                if is_constant_data:
                    expected_score = vals[0] * np.sum(_CK_WEIGHTS)
                    print(f"Expected constant score: {expected_score:.6f}")
                    print(f"Actual scores min/max: {scores.min():.6f}/{scores.max():.6f}")
                    
                    # If convolution creates artifacts, use the expected constant value
                    if not np.allclose(scores, expected_score, rtol=1e-10):
                        print("⚠️ Convolution artifacts detected, using constant score")
                        scores = np.full_like(scores, expected_score)
                
                # Calculate adaptive threshold for sleep-wake classification
                # Uses the minimum of: original threshold * 0.3 OR mean movement * 1.0
                adjusted_threshold = min(_CK_THRESHOLD * 0.3, vals.mean() * 1.0)
                
                # For constant data with low movement, use a higher threshold
                # This prevents classifying very still sleep as wake
                if is_constant_data and vals[0] < 1.0:  # If constant and low movement
                    adjusted_threshold = _CK_THRESHOLD * 0.5  # Use a higher threshold
                    print(f"Using higher threshold for constant data: {adjusted_threshold:.3f}")
                
                # Classify each minute as sleep (0) or wake (1) based on threshold
                sleep_wake = pd.Series((scores >= adjusted_threshold).astype(int), index=movement_score.index)

                # Prepare classification data for database storage
                classification_data = [
                    {
                        "sleep_record_id": rec_id,
                        "timestamp": ts.isoformat(),
                        "state": int(state)  # 0 = sleep, 1 = wake
                    }
                    for ts, state in sleep_wake.items()
                ]

                # Store Cole-Kripke classification in database
                await supabase.from_("sleep_classification").insert(classification_data).execute()
                print("Inserted Cole-Kripke sleep classification (movement-based).")

                # Calculate Total Sleep Time (TST) - count minutes classified as sleep
                tst_minutes = int((sleep_wake == 0).sum())  

                print(f"Scores (Cole-Kripke): {len(scores)} values")
                print("CK Score stats:", scores.min(), scores.max())
                print("Sleep wake counts:", sleep_wake.value_counts())
                print("Cole-Kripke scores:", scores[:10])  
                print(f"TST: {tst_minutes} minutes")
                print(f"Adjusted threshold: {adjusted_threshold:.3f}")

                # Calculate Sleep Quality Metrics
                # Find first sleep period (first occurrence of 0)
                first_sleep_mask = (sleep_wake == 0)
                if first_sleep_mask.any():
                    first_sleep_idx = first_sleep_mask.idxmax()
                    # Sleep Onset Latency (SOL): time from start to first sleep
                    sol_seconds = int((first_sleep_idx - sleep_wake.index[0]).total_seconds())
                else:
                    # If never slept, SOL = None
                    sol_seconds = None
                
                # Calculate Wake After Sleep Onset (WASO)
                # Find first sleep period for WASO calculation
                first_sleep_mask = (sleep_wake == 0)
                if first_sleep_mask.any():
                    first_sleep_idx = first_sleep_mask.idxmax()
                    # Count wake periods (1s) after the first sleep period
                    waso_minutes = int((sleep_wake[first_sleep_idx:] == 1).sum())
                else:
                    # If never slept, WASO = 0
                    waso_minutes = 0
                
                # Calculate Fragmentation Index
                # Measures how often sleep/wake transitions occur
                frag_index = float(sleep_wake.diff().abs().sum() / len(sleep_wake))
                
                print(f"SOL: {sol_seconds}s, WASO: {waso_minutes}min, Frag: {frag_index}")
            else: 
                print("❌ Not enough accelerometer data for Cole-Kripke")

            # Heart Rate Variability (HRV) Analysis
            if df[df.sensor_type == "heart_rate"].empty:
                print("❌ No heart_rate data found for this record")
            else:
                # Extract and process heart rate data from database
                hr = (df[df.sensor_type == "heart_rate"]
                        .assign(hr=lambda d: d.value.map(lambda v: json.loads(v)["heartRate"]))
                        .set_index("ts").hr.resample("1s").ffill())  # Resample to 1-second intervals
                
                # Convert heart rate (bpm) to Inter-Beat Intervals (IBI) in milliseconds
                # Formula: IBI (ms) = 60000 / heart_rate (bpm)
                # This converts from beats per minute to milliseconds between beats
                ibi = 60000.0 / hr
                
                # Convert to RRI (RR intervals) and clean the data
                # RRI represents the time between consecutive R-peaks in ECG
                rri = pd.to_numeric(ibi.dropna(), errors="coerce").dropna().to_numpy()
                
                if not np.issubdtype(rri.dtype, np.number) or len(rri) < 3:
                    print("❌ Invalid or too short RRI:", rri)
                else:
                    # Add debug logging for HRV calculation process
                    print(f"HR sample values: {hr.head()}")
                    print(f"IBI sample values: {ibi.head()}")
                    print(f"RRI before filtering: {rri[:10]}")
                    
                    # Filter RRI values to physiologically plausible range
                    # 500-1200 ms corresponds to heart rates of 50-120 bpm
                    # This removes outliers that could skew HRV calculations
                    rri = [x for x in rri if np.isfinite(x) and x > 500 and x < 1200]
                    
                    print(f"RRI after filtering: {rri[:10]}")
                    print(f"RRI stats: min={min(rri) if rri else 'N/A'}, max={max(rri) if rri else 'N/A'}, mean={np.mean(rri) if rri else 'N/A'}")
                    
                    if len(rri) < 3:
                        print("Not enough valid RRI values after filtering.")
                    else: 
                        # Convert RRI from milliseconds to seconds for neurokit2 library
                        # neurokit2 expects RRI values in seconds, not milliseconds
                        rri_seconds = np.array(rri) / 1000.0
                        print(f"RRI in seconds: {rri_seconds[:10]}")
                        
                        # Convert RRI intervals to peaks for HRV analysis
                        # This creates a signal representation that neurokit2 can process
                        peaks = nk.intervals_to_peaks(rri_seconds, sampling_rate=1)
                        
                        # Calculate HRV metrics using neurokit2 library
                        # RMSSD: Root Mean Square of Successive Differences (parasympathetic activity)
                        # SDNN: Standard Deviation of NN Intervals (overall HRV)
                        hrv = nk.hrv_time(peaks=peaks, sampling_rate=1)

                        # Extract RMSSD and SDNN metrics from the results
                        rmssd = float(hrv["HRV_RMSSD"].item())
                        sdnn = float(hrv["HRV_SDNN"].item())
                        print(f"HRV_RMSSD: {hrv['HRV_RMSSD']}, HRV_SDNN: {hrv['HRV_SDNN']}")

                        # Store HRV metrics safely using the helper function
                        hrv_rmssd = safe_float(hrv["HRV_RMSSD"])
                        hrv_sdnn = safe_float(hrv["HRV_SDNN"])

    # Prepare metrics dictionary for database storage
    # All metrics are validated and converted to appropriate types
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

    # Store sleep metrics in database
    await supabase.from_("sleep_metrics").insert(metrics).execute()

    # Sleep Stage Estimation (only if we have valid data and heart rate)
    # This section estimates sleep stages using both movement and heart rate data
    if is_valid:
        print("HR length:", len(hr))
        print("Sleep wake length:", len(sleep_wake))

        # Sleep stage estimation: wake, light, deep
        if hr.empty:
            print("No HR data, skipping sleep stage estimation.")
            return

        # Ensure both datasets are sorted by timestamp for proper alignment
        hr = hr.sort_index()
        sleep_wake = sleep_wake.sort_index()

        # Align heart rate data to accelerometer timestamps
        # Uses nearest neighbor matching with 15-second tolerance
        # This ensures we have both movement and heart rate data for each time point
        hr_aligned = hr.reindex(sleep_wake.index, method="nearest", tolerance=pd.Timedelta("15s"))

        # Remove timestamps where heart rate couldn't be aligned
        # This ensures data quality for sleep stage estimation
        valid_idx = hr_aligned.dropna().index
        hr_aligned = hr_aligned.loc[valid_idx]
        sleep_wake_valid = sleep_wake.loc[valid_idx]

        print(f"HR length after alignment: {len(hr_aligned)}")
        print(f"Sleep wake length after filtering: {len(sleep_wake_valid)}")

        # Calculate percentiles for sleep stage classification
        # Uses heart rate distribution to classify deep vs light sleep
        # Lower heart rate typically indicates deeper sleep
        percentiles = np.percentile(hr_aligned.values, [25, 50])

        def classify_stage(ts, value):
            """
            Classify sleep stage based on Cole-Kripke state and heart rate.
            
            Classification logic:
            - Wake: Cole-Kripke classified as awake (state = 1)
            - Deep: Cole-Kripke classified as sleep AND heart rate below 25th percentile
            - Light: Cole-Kripke classified as sleep AND heart rate above 25th percentile
            
            Args:
                ts: Timestamp
                value: Heart rate value
                
            Returns:
                str: 'wake', 'light', or 'deep'
            """
            awake = sleep_wake_valid.loc[ts] == 1  # Check if Cole-Kripke classified as awake
            if awake:
                return "wake"
            elif value < percentiles[0]:  # Heart rate below 25th percentile = deep sleep
                return "deep"
            else:  # Heart rate above 25th percentile = light sleep
                return "light"


        # Apply classification to all aligned data points
        # This creates a time series of sleep stage classifications
        stages = pd.Series(
            [classify_stage(ts, val) for ts, val in hr_aligned.items()],
            index=hr_aligned.index
        )

        # Convert stage classifications to time intervals
        # This creates continuous periods of each sleep stage with start/end times
        # Minimum duration of 1 minute is enforced to avoid noise
        results = []
        current_stage = None
        start_time = None
        
        for ts, stage in stages.items():
            if stage != current_stage:
                if current_stage is not None:
                    # Ensure minimum duration of 1 minute for each stage
                    # This prevents very short stage changes that are likely noise
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

        # Handle the last stage segment
        # Ensure proper end time and minimum duration for the final stage
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

        # Convert timestamps to ISO format for database storage
        # Supabase requires ISO 8601 format for datetime fields
        for result in results:
            result["start_time"] = result["start_time"].isoformat()
            result["end_time"] = result["end_time"].isoformat()

        print("Inserting sleep stages:", results[:3])
        await supabase.from_("sleep_stages").insert(results).execute()  
    else:
        print("❌ Not enough data to insert sleep stages") 
        # Insert invalid record if no valid data
        # This ensures the database has a record even when processing fails
        await supabase.from_("sleep_stages").insert({
            "sleep_record_id": rec_id, 
            "stage": "invalid",
            "start_time": None,
            "end_time": None
        }).execute()  