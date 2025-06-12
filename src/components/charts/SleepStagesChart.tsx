import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { supabase } from '../../api/supabaseClient';
import { parseISO } from 'date-fns';
import { format } from 'date-fns-tz';

type SleepStage = 'wake' | 'light' | 'deep';

interface SleepStagesChartProps {
  sleepRecordId: number;
  width?: number;
  height?: number;
}

const stageColor: Record<SleepStage, string> = {
  wake: '#facc15',
  light: '#60a5fa',
  deep: '#6366f1',
};

const stageLabels: Record<SleepStage, string> = {
  wake: 'Awake',
  light: 'Light',
  deep: 'Deep'
};

const stageOrder: SleepStage[] = ['wake', 'light', 'deep'];


export const SleepStagesChart = ({
    sleepRecordId,
    width = 300,
    height = 120,
  }: SleepStagesChartProps) => {
    const [blocks, setBlocks] = useState<
      { x: number; width: number; y: number; stage: SleepStage; startTime: Date; endTime: Date }[]
    >([]);
    const [timeLabels, setTimeLabels] = useState<string[]>([]);
    
    const paddingLeft = 40;
    const paddingBottom = 20;
    const chartWidth = width - paddingLeft;
    const chartHeight = height - paddingBottom;
    const rowHeight = chartHeight / stageOrder.length;
  
    useEffect(() => {
      const fetchStages = async () => {
        const { data, error } = await supabase
          .from('sleep_stages')
          .select('stage, start_time, end_time')
          .eq('sleep_record_id', sleepRecordId)
          .order('start_time', { ascending: true });
  
        if (error || !data || data.length === 0) {
          console.error('Error fetching stages:', error);
          return;
        }
  
        // Filter out records that are not part of the main sleep session
        const relevantData = data.filter(record => {
          const time = new Date(record.start_time);
          return time.getHours() >= 20 || time.getHours() < 6; // Only keep records between 8 PM and 6 AM
        });
  
        if (relevantData.length === 0) {
          console.error('No relevant sleep stages found');
          return;
        }
  
        const startTime = new Date(relevantData[0].start_time);
        const endTime = new Date(relevantData[relevantData.length - 1].end_time);
        const totalDuration = endTime.getTime() - startTime.getTime();
  
        console.log('Raw data:', relevantData);
        console.log('Start time:', startTime.toLocaleString());
        console.log('End time:', endTime.toLocaleString());
  
        const labels = [];
        for (let i = 0; i <= 4; i++) {
          const time = new Date(startTime.getTime() + (totalDuration * i) / 4);
          console.log('Time point:', time.toLocaleString());
          labels.push(format(time, 'HH:mm'));
        }
        setTimeLabels(labels);
  
        const newBlocks = relevantData.map(row => {
          const start = new Date(row.start_time);
          const end = new Date(row.end_time);
          console.log('Block:', {
            stage: row.stage,
            start: start.toLocaleString(),
            end: end.toLocaleString()
          });
          const x = ((start.getTime() - startTime.getTime()) / totalDuration) * chartWidth;
          const blockWidth = ((end.getTime() - start.getTime()) / totalDuration) * chartWidth;
          const y = stageOrder.indexOf(row.stage as SleepStage) * rowHeight;
  
          return {
            x: x + paddingLeft,
            width: Math.max(blockWidth, 1),
            y,
            stage: row.stage as SleepStage,
            startTime: start,
            endTime: end,
          };
        });
  
        setBlocks(newBlocks);
      };
  
      fetchStages();
    }, [sleepRecordId]);
  
    if (blocks.length === 0) return null;
  
    return (
      <View style={{ margin: 20 }}>
        <Svg width={width} height={height}>
          {/* Y axis labels */}
          {stageOrder.map((stage, i) => (
            <SvgText
              key={stage}
              x={paddingLeft - 5}
              y={i * rowHeight + rowHeight / 2}
              fontSize="10"
              textAnchor="end"
              alignmentBaseline="middle"
              fill="#333"
            >
              {stageLabels[stage]}
            </SvgText>
          ))}
  
          {/* Time labels on X axis */}
          {timeLabels.map((label, i) => (
            <SvgText
              key={i}
              x={paddingLeft + (chartWidth * i) / 4}
              y={chartHeight + 12}
              fontSize="10"
              textAnchor="middle"
              fill="#333"
            >
              {label}
            </SvgText>
          ))}
  
          {/* Blocks */}
          {blocks.map((block, i) => (
            <Rect
              key={i}
              x={block.x}
              y={block.y}
              width={block.width}
              height={rowHeight - 2}
              fill={stageColor[block.stage]}
              rx={2}
              ry={2}
            />
          ))}
        </Svg>
      </View>
    );
  };
  