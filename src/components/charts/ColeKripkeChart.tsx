import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { AreaChart, YAxis, XAxis } from 'react-native-svg-charts';
import { Defs, LinearGradient, Stop } from 'react-native-svg';
import { supabase } from '../../api/supabaseClient';
import { format } from 'date-fns';

interface CKClassificationChartProps {
  sleepRecordId: number;
}

export const CKClassificationChart = ({ sleepRecordId }: CKClassificationChartProps) => {
  const [labels, setLabels] = useState<string[]>([]);
  const [states, setStates] = useState<number[]>([]);

  useEffect(() => {
    const fetchClassification = async () => {
      const { data, error } = await supabase
        .from('sleep_classification') 
        .select('timestamp, state')
        .eq('sleep_record_id', sleepRecordId);

      if (error) {
        console.error('Error fetching Cole-Kripke classification:', error);
        return;
      }

      if (!data) return;

      const sorted = data.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const labels = sorted.map((d: any, i: number) =>
        i % Math.ceil(sorted.length / 5) === 0
          ? format(new Date(d.timestamp), 'HH:mm')
          : ''
      );

      const stateValues = sorted.map((d: any) => parseInt(d.state));

      setLabels(labels);
      setStates(stateValues);
    };

    fetchClassification();
  }, [sleepRecordId]);

  if (states.length === 0) return null;

  const contentInset = { top: 10, bottom: 10, left: 10, right: 10 };

  const Gradient = () => (
    <Defs key="gradient">
      <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#22c55e" stopOpacity={0.8} />
        <Stop offset="1" stopColor="#22c55e" stopOpacity={0.1} />
      </LinearGradient>
    </Defs>
  );

  return (
    <View style={{ marginHorizontal: 20, height: 160 }}>
      <View style={{ flexDirection: 'row', height: 160 }}>
        <YAxis
          data={[0, 1]}
          contentInset={contentInset}
          svg={{ fill: 'grey', fontSize: 10 }}
          numberOfTicks={2}
          min={0}
          max={1}
          domain={[0, 1]}
          formatLabel={(value: number) => value.toString()}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <AreaChart
            style={{ flex: 1 }}
            data={states}
            contentInset={contentInset}
            svg={{ fill: 'url(#gradient)' }}
          >
            <Gradient />
          </AreaChart>
          <XAxis
            data={states}
            formatLabel={(value: number, index?: number) => index !== undefined ? labels[index] || '' : ''}
            contentInset={contentInset}
            svg={{ fill: 'grey', fontSize: 10 }}
          />
        </View>
      </View>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Text style={{ fontSize: 12, color: 'gray' }}>
          * 0 = Sleep, 1 = Awake
        </Text>
      </View>
    </View>
  );
};
