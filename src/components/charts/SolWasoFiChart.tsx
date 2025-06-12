import React, { useEffect, useState } from 'react';
import { View, Dimensions, Text } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { supabase } from '../../api/supabaseClient';

const screenWidth = Dimensions.get('window').width;

export const SleepQualityChart = ({ sleepRecordId }: { sleepRecordId: number }) => {
  const [metrics, setMetrics] = useState<{
    sol: number;
    waso: number;
    fragmentation_index: number;
  } | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      const { data, error } = await supabase
        .from('sleep_metrics')
        .select('sol_seconds, waso_minutes, fragmentation_index')
        .eq('sleep_record_id', sleepRecordId)
        .single();

      if (error) {
        console.error('Error fetching sleep quality metrics:', error);
        return;
      }

      setMetrics({
        sol: data.sol_seconds/60,
        waso: data.waso_minutes,
        fragmentation_index: data.fragmentation_index * 100, 
      });
    };

    fetchMetrics();
  }, [sleepRecordId]);

  if (!metrics) return null;

  return (
    <View>
      <BarChart
        data={{
            labels: ['SOL (min)', 'WASO (min)', 'Fragmentation (%)'],
            datasets: [
            { data: [metrics.sol, metrics.waso, metrics.fragmentation_index] },
            ],
        }}
        width={screenWidth - 40}
        height={250}
        yAxisLabel=""
        yAxisSuffix=""
        fromZero
        chartConfig={{
            backgroundColor: '#fff',
            backgroundGradientFrom: '#f9fafb',
            backgroundGradientTo: '#f9fafb',
            decimalPlaces: 1,
            color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(30, 41, 59, ${opacity})`,
        }}
        style={{ marginHorizontal: 20, borderRadius: 16, marginBottom: 10 }}
        />
    </View>
  );
};
