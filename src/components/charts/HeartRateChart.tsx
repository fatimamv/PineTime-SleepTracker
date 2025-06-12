import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import { supabase } from '../../api/supabaseClient';
import { format } from 'date-fns';

interface HeartRateChartProps {
  sleepRecordId: number;
}

export const HeartRateChart = ({ sleepRecordId }: HeartRateChartProps) => {
  const [dataPoints, setDataPoints] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    const fetchHeartRateData = async () => {
      const [{ data: hrData, error: hrError }] = await Promise.all([
        supabase
          .from('raw_sensor_data')
          .select('value, captured_at')
          .eq('sleep_record_id', sleepRecordId)
          .eq('sensor_type', 'heart_rate')
      ]);

      if (hrError) console.error('Error fetching HR data:', hrError);

      if (!hrData) return;

      const sorted = hrData.sort(
        (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
      );

      const heartRates = sorted
        .map((d: any) => {
          try {
            return JSON.parse(d.value).heartRate;
          } catch {
            return null;
          }
        })
        .filter((v) => typeof v === 'number');

      const timeLabels = sorted.map((d: any, i: number) =>
        i % Math.ceil(sorted.length / 5) === 0
          ? format(new Date(d.captured_at), 'HH:mm')
          : ''
      );

      setDataPoints(heartRates);
      setLabels(timeLabels);
    };

    fetchHeartRateData();
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
          decimalPlaces: 0,
          color: (opacity = 1) => `rgba(0, 191, 255, ${opacity})`,
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
