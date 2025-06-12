import React, { useEffect, useState } from 'react';
import { View, Dimensions, Text } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { supabase } from '../../api/supabaseClient';

const screenWidth = Dimensions.get('window').width;

export const HrvChart = ({ sleepRecordId }: { sleepRecordId: number }) => {
  const [hrvData, setHrvData] = useState<{ rmssd: number; sdnn: number } | null>(null);

  useEffect(() => {
    const fetchHRV = async () => {
      const { data, error } = await supabase
        .from('sleep_metrics')
        .select('hrv_rmssd, hrv_sdnn')
        .eq('sleep_record_id', sleepRecordId)
        .single();

      if (error) {
        console.error('Error fetching HRV:', error);
        return;
      }

      setHrvData({ rmssd: data.hrv_rmssd, sdnn: data.hrv_sdnn });
    };

    fetchHRV();
  }, [sleepRecordId]);

  if (!hrvData) return null;

  return (
    <View>
      <BarChart
        data={{
          labels: ['RMSSD', 'SDNN'],
          datasets: [{ data: [hrvData.rmssd, hrvData.sdnn] }],
        }}
        width={screenWidth - 40}
        height={250}
        yAxisSuffix=" ms"
        yAxisLabel=""
        fromZero
        chartConfig={{
          backgroundColor: '#fff',
          backgroundGradientFrom: '#f9fafb',
          backgroundGradientTo: '#f9fafb',
          decimalPlaces: 1,
          color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(30, 41, 59, ${opacity})`,
          style: { borderRadius: 16 },
        }}
        style={{ marginHorizontal: 20, borderRadius: 16, marginBottom: 10 }}
      />
    </View>
  );
};
