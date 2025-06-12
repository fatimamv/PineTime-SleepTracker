import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { supabase } from '../../api/supabaseClient';
import { format } from 'date-fns';

interface AccelerometerChartProps {
  sleepRecordId: number;
}

export const AccelerometerChart = ({ sleepRecordId }: AccelerometerChartProps) => {
  const [dataPoints, setDataPoints] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    const fetchAccelerometerData = async () => {
      const { data, error } = await supabase
        .from('raw_sensor_data')
        .select('value, captured_at')
        .eq('sleep_record_id', sleepRecordId)
        .eq('sensor_type', 'accelerometer');

      if (error) {
        console.error('Error fetching accelerometer data:', error);
        return;
      }

      if (!data) return;

      const sorted = data.sort(
        (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
      );

      const magnitudes = sorted.map((d: any) => {
        try {
          const val = JSON.parse(d.value);
          const x = val.x ?? 0;
          const y = val.y ?? 0;
          const z = val.z ?? 0;
          return Math.sqrt(x ** 2 + y ** 2 + z ** 2);
        } catch {
          return null;
        }
      }).filter((v) => typeof v === 'number');

      const timeLabels = sorted.map((d: any, i: number) =>
        i % Math.ceil(sorted.length / 5) === 0
          ? format(new Date(d.captured_at), 'HH:mm')
          : ''
      );

      setDataPoints(magnitudes);
      setLabels(timeLabels);
    };

    fetchAccelerometerData();
  }, [sleepRecordId]);

  if (dataPoints.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 20 }}>
      <LineChart
        data={{
          labels,
          datasets: [{ data: dataPoints }]
        }}
        width={Dimensions.get('window').width - 40}
        height={200}
        chartConfig={{
          backgroundColor: '#ffffff',
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          decimalPlaces: 2,
          color: (opacity = 1) => `rgba(255, 99, 132, ${opacity})`,
          style: { borderRadius: 16 }
        }}
        bezier
        style={{
          marginVertical: 8,
          borderRadius: 16
        }}
      />
    </View>
  );
};
