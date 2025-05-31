import pandas as pd
from pyActigraphy.io import BaseRaw

class DirectActigraphy(BaseRaw):
    def __init__(self, accel_series: pd.Series):
        self._accel_series = accel_series
        super().__init__()

    def _read_raw_data(self):
        self.data = pd.DataFrame({
            "activity": self._accel_series
        })
        self._set_start_time(self.data.index[0])
        self._set_sampling_rate("60S")  # Ajusta si no es 60s
        self._check_data_integrity()


def estimate_sleep_stages(accel_series: pd.Series):
    act = DirectActigraphy(accel_series)
    sleep = act.detect_sleep(method="sadeh")

    print("🔍 Completed sleep stages detection:")
    print(sleep.sleep.head(30))

    return sleep.sleep
