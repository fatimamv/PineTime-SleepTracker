import { View, Text, TouchableOpacity, ScrollView, TextInput, FlatList } from 'react-native'
import { format } from 'date-fns'
import Icon from 'react-native-vector-icons/Feather'
import React, { useState, useEffect } from 'react'
import { HeartRateChart } from '../components/charts/HeartRateChart'
import { AccelerometerChart } from '../components/charts/AccelerometerChart'
import { CKClassificationChart } from '../components/charts/ColeKripkeChart'
import { SleepStagesChart } from '../components/charts/SleepStagesChart'
import { HrvChart } from '../components/charts/HRVChart'
import { SleepQualityChart } from '../components/charts/SolWasoFiChart'
import { supabase } from '../api/supabaseClient'
import { DataModal } from '../components/DataModal'
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, COMMON_STYLES } from '../constants/theme'
import styles from './styles';

const STAT_CATEGORIES = [
  'Heart Rate',
  'Accelerometer',
  'Cole-Kripke', 
  'Sleep Stages',
  'HRV',
  'Sleep Quality',
]

interface MagnitudeData {
  time: string;
  value: string;
}

interface XYZData {
  time: string;
  x: string;
  y: string;
  z: string;
}

export const StatisticsScreen = () => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Heart Rate'])
  const [recordId, setRecordId] = useState('')
  const [recordDate, setRecordDate] = useState<Date | null>(null)
  const [availableMetrics, setAvailableMetrics] = useState<{[key: string]: boolean}>({})

  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalData, setModalData] = useState<{ time: string; value: string | number }[]>([]);
  const [modalExtraContent, setModalExtraContent] = useState<React.ReactNode>(null);

  const fetchLastRecordId = async () => {
    const { data, error } = await supabase
      .from('sleep_records')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error('Error fetching last record:', error);
      return;
    }

    if (data) {
      setRecordId(data.id.toString());
      setRecordDate(new Date(data.created_at));
    }
  };

  useEffect(() => {
    fetchLastRecordId();
  }, []);

  const checkDataAvailability = async (id: string) => {
    if (!id) {
      setAvailableMetrics({});
      return;
    }

    const metrics: {[key: string]: boolean} = {};

    // Check Heart Rate data
    const { data: hrData } = await supabase
      .from('raw_sensor_data')
      .select('id')
      .eq('sleep_record_id', id)
      .eq('sensor_type', 'heart_rate')
      .limit(1);
    metrics['Heart Rate'] = (hrData?.length ?? 0) > 0;

    // Check Accelerometer data
    const { data: accData } = await supabase
      .from('raw_sensor_data')
      .select('id')
      .eq('sleep_record_id', id)
      .eq('sensor_type', 'accelerometer')
      .limit(1);
    metrics['Accelerometer'] = (accData?.length ?? 0) > 0;

    // Check Cole-Kripke data
    const { data: ckData } = await supabase
      .from('sleep_classification')
      .select('id')
      .eq('sleep_record_id', id)
      .limit(1);
    metrics['Cole-Kripke'] = (ckData?.length ?? 0) > 0;

    // Check Sleep Stages data
    const { data: stagesData } = await supabase
      .from('sleep_stages')
      .select('stage')
      .eq('sleep_record_id', id)
      .limit(1);
    
    metrics['Sleep Stages'] = Boolean(
      stagesData && 
      stagesData.length > 0 && 
      !stagesData.some(stage => stage.stage === 'invalid')
    );

    // Check HRV data
    const { data: hrvData } = await supabase
      .from('sleep_metrics')
      .select('hrv_rmssd, hrv_sdnn')
      .eq('sleep_record_id', id)
      .single();
    metrics['HRV'] = !!(hrvData?.hrv_rmssd && hrvData?.hrv_sdnn);

    // Check Sleep Quality data
    const { data: qualityData } = await supabase
      .from('sleep_metrics')
      .select('waso_minutes, fragmentation_index, sol_seconds')
      .eq('sleep_record_id', id)
      .single();

    // Verificar que los campos existan y no sean null
    metrics['Sleep Quality'] = Boolean(qualityData && 
      typeof qualityData.waso_minutes === 'number' && 
      typeof qualityData.fragmentation_index === 'number' && 
      typeof qualityData.sol_seconds === 'number');
      
    setAvailableMetrics(metrics);
  };

  const handleCategoryPress = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        // If it's the last selected category, don't remove it
        if (prev.length === 1) return prev;
        return prev.filter(cat => cat !== category);
      }
      return [...prev, category];
    });
  };

  const handleRecordIdChange = async (text: string) => {
    // Only allow numbers
    const numericValue = text.replace(/[^0-9]/g, '')
    setRecordId(numericValue)

    if (numericValue) {
      const { data, error } = await supabase
        .from('sleep_records')
        .select('created_at')
        .eq('id', numericValue)
        .single()

      if (error) {
        console.error('Error fetching record date:', error)
        setRecordDate(null)
        setSelectedCategories([]) // Reset selected categories on error
        return
      }

      if (data?.created_at) {
        setRecordDate(new Date(data.created_at))
        await checkDataAvailability(numericValue);
        // Reset selected categories when changing ID
        setSelectedCategories([])
      }
    } else {
      setRecordDate(null)
      setAvailableMetrics({});
      setSelectedCategories([]) // Reset selected categories when clearing ID
    }
  }

  return (
    <>
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Statistics</Text>
          <View style={[styles.recordInput, {marginTop: 5}]}>
            <View style={styles.rowContainer}>
              <Text style={styles.recordLabel}>Record ID:</Text>
              <TextInput
                style={[styles.input, { width: 50 }]}
                value={recordId}
                onChangeText={handleRecordIdChange}
                keyboardType="numeric"
                placeholder="Enter ID"
                maxLength={10}
              />
            </View>
            {recordDate && (
              <View style={styles.dateContainer}>
                <Icon name="calendar" size={16} color={COLORS.text.primary} style={styles.dateIcon} />
                <Text>
                  {format(recordDate, 'MMMM do, yyyy')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Category Buttons */}
      <View style={styles.categoryButtons}>
        {STAT_CATEGORIES.map((cat) => {
          const hasData = availableMetrics[cat] ?? false;

          return (
          <TouchableOpacity
            key={cat}
              onPress={() => hasData && handleCategoryPress(cat)}
              style={[
                styles.categoryButton,
                selectedCategories.includes(cat) && styles.categoryButtonSelected,
                !hasData && styles.categoryButtonDisabled
              ]}
              disabled={!hasData}
            >
              <Text style={[
                styles.categoryText,
                selectedCategories.includes(cat) && styles.categoryTextSelected,
                !hasData && styles.categoryTextDisabled
              ]}>{cat}</Text>
          </TouchableOpacity>
          );
        })}
      </View>

      {/* Chart Containers */}
      {selectedCategories.map((cat) => (
          <View key={cat} style={[
            styles.chartContainer,
            (cat === 'HRV' || cat === 'Sleep Quality') && styles.tallChartContainer
          ]}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>{cat}</Text>
            {cat === 'Heart Rate' && (
              <TouchableOpacity
                style={styles.showDataButton}
              onPress={async () => {
                if (!recordId) return;

                const { data, error } = await supabase
                  .from('raw_sensor_data')
                  .select('value, captured_at')
                  .eq('sleep_record_id', recordId)
                  .eq('sensor_type', 'heart_rate');

                if (error || !data) {
                  console.error('Error fetching HR raw data:', error);
                  return;
                }

                const processed = data.map(d => {
                  const parsed = JSON.parse(d.value);
                  return {
                    time: format(new Date(d.captured_at), 'HH:mm:ss'),
                    value: parsed.heartRate,
                  };
                });

                setModalTitle('Heart Rate Raw Data');
                setModalData(processed);
                setModalExtraContent(
                  <View style={styles.modalTableContainer}>
                    <View style={styles.modalRow}>
                      <Text style={styles.modalHeaderCell}>Time</Text>
                      <Text style={styles.modalHeaderCell}>Heart Rate (bpm)</Text>
                    </View>
                    {processed.map((item, index) => (
                      <View key={index} style={styles.modalRow}>
                        <Text style={styles.modalCell}>{item.time}</Text>
                        <Text style={styles.modalCell}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                );
                setModalVisible(true);
              }}
            >
                <Text style={styles.showDataButtonText}>Show data</Text>
              </TouchableOpacity>
            )}
            {cat === 'Accelerometer' && ( 
              <TouchableOpacity
              style={styles.showDataButton}
              onPress={async () => {
                if (!recordId) return;
            
                const { data, error } = await supabase
                  .from('raw_sensor_data')
                  .select('value, captured_at')
                  .eq('sleep_record_id', recordId)
                  .eq('sensor_type', 'accelerometer');
            
                if (error || !data) {
                  console.error('Error fetching accelerometer data:', error);
                  return;
                }
            
                const magnitudeTable: MagnitudeData[] = [];
                const xyzTable: XYZData[] = [];
            
                data.forEach((d: any) => {
                  let x = 0, y = 0, z = 0;
                  try {
                    const val = JSON.parse(d.value);
                    x = val.x ?? 0;
                    y = val.y ?? 0;
                    z = val.z ?? 0;
                  } catch {}
            
                  const mag = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
                  const time = format(new Date(d.captured_at), 'HH:mm:ss');
            
                  magnitudeTable.push({
                    time,
                    value: mag.toFixed(3),
                  });
            
                  xyzTable.push({ time, x: x.toFixed(3), y: y.toFixed(3), z: z.toFixed(3) });
                });
            
                setModalTitle('Accelerometer Magnitude');
                setModalData(magnitudeTable);
            
                setModalExtraContent(
                  <View>
                    <Text style={styles.modalInfoText}>
                      * Magnitude = √(x² + y² + z²)
                    </Text>

                    <Text style={styles.modalSectionTitle}>Raw Axes</Text>
                    <View style={styles.modalTableContainer}>
                      <View style={styles.modalRow}>
                        <Text style={styles.modalHeaderCell}>Time</Text>
                        <Text style={styles.modalHeaderCell}>X</Text>
                        <Text style={styles.modalHeaderCell}>Y</Text>
                        <Text style={styles.modalHeaderCell}>Z</Text>
                      </View>
                      {xyzTable.map((item, index) => (
                        <View key={index} style={styles.modalRow}>
                          <Text style={styles.modalCell}>{item.time}</Text>
                          <Text style={styles.modalCell}>{item.x}</Text>
                          <Text style={styles.modalCell}>{item.y}</Text>
                          <Text style={styles.modalCell}>{item.z}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
            
                setModalVisible(true);
              }}
            >
              <Text style={styles.showDataButtonText}>Show data</Text>
            </TouchableOpacity>                      
            )}
            {cat === 'Cole-Kripke' && (
              <TouchableOpacity
                style={styles.showDataButton}
                onPress={async () => {
                  if (!recordId) return;

                  const { data, error } = await supabase
                    .from('sleep_classification')
                    .select('timestamp, state')
                    .eq('sleep_record_id', recordId);

                  if (error || !data) {
                    console.error('Error fetching CK data:', error);
                    return;
                  }

                  const processed = data
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map(d => ({
                      time: format(new Date(d.timestamp), 'HH:mm:ss'),
                      value: d.state === 0 ? '0 = Sleep' : '1 = Awake',
                    }));

                  setModalTitle('Cole-Kripke Raw Classification');
                  setModalData(processed);
                  setModalExtraContent(null);
                  setModalVisible(true);
                }}
              >
                <Text style={styles.showDataButtonText}>Show data</Text>
              </TouchableOpacity>
            )}
            {cat === 'Sleep Stages' && (
              <TouchableOpacity
                style={styles.showDataButton}
                onPress={async () => {
                  if (!recordId) return;

                  const { data, error } = await supabase
                    .from('sleep_stages')
                    .select('stage, start_time, end_time')
                    .eq('sleep_record_id', recordId)
                    .order('start_time', { ascending: true });

                  if (error || !data) {
                    console.error('Error fetching Sleep Stages data:', error);
                    return;
                  }

                  const processed = data.map(d => ({
                    time: format(new Date(d.start_time), 'HH:mm:ss') + ' - ' + format(new Date(d.end_time), 'HH:mm:ss'),
                    value: d.stage,
                    time_on_stage: Math.round((new Date(d.end_time).getTime() - new Date(d.start_time).getTime()) / 1000 / 60) + ' min',
                  }));

                  setModalTitle('Sleep Stages Raw Data');
                  setModalData([] as { time: string; value: string | number; }[]);
                  setModalExtraContent(
                    <View>
                      <View>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalHeaderCell}>Time</Text>
                          <Text style={styles.modalHeaderCell}>Stage</Text>
                          <Text style={styles.modalHeaderCell}>Duration</Text>
                        </View>
                        {processed.map((item, index) => (
                          <View key={index} style={styles.modalRow}>
                            <Text style={styles.modalCell}>{item.time}</Text>
                            <Text style={styles.modalCell}>{item.value}</Text>
                            <Text style={styles.modalCell}>{item.time_on_stage}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                  setModalVisible(true);
                }}
              >
                <Text style={styles.showDataButtonText}>Show data</Text>
              </TouchableOpacity>
            )}
            {cat === 'HRV' && (
              <TouchableOpacity
                style={styles.showDataButton}
                onPress={async () => {
                  if (!recordId) return;

                  const { data, error } = await supabase
                    .from('sleep_metrics')
                    .select('hrv_rmssd, hrv_sdnn')
                    .eq('sleep_record_id', recordId)
                    .single();

                  if (error || !data) {
                    console.error('Error fetching HRV data:', error);
                    return;
                  }

                  setModalTitle('HRV Raw Data');  
                  setModalData([{ time: 'RMSSD', value: data.hrv_rmssd }, { time: 'SDNN', value: data.hrv_sdnn }]);
                  setModalVisible(true);
                  setModalExtraContent(
                    <View>
                      <Text style={styles.modalInfoText}>
                        ───────────────────────────────────────{"\n"}
                        • <Text style={styles.modalBoldText}>RR intervals</Text>{"\n"}
                        Time between consecutive heartbeats.{"\n"}
                        Calculated as: RR (ms) = 60000 / heart rate (bpm).{"\n"}
                        ───────────────────────────────────────{"\n"}
                        • <Text style={styles.modalBoldText}>RMSSD</Text>{"\n"}
                        Root mean square of successive differences between RR intervals.{"\n"}
                        ───────────────────────────────────────{"\n"}
                        • <Text style={styles.modalBoldText}>SDNN</Text>{"\n"}
                        Standard deviation of the RR intervals over the full recording.{"\n"}
                        ───────────────────────────────────────
                      </Text>
                    </View>
                  );
                }}
              >
                <Text style={styles.showDataButtonText}>Show data</Text>
              </TouchableOpacity>
            )}
            {cat === 'Sleep Quality' && (
              <TouchableOpacity
                style={styles.showDataButton}
                onPress={async () => {
                  if (!recordId) return;

                  const { data, error } = await supabase
                    .from('sleep_metrics')
                    .select('sol_seconds, waso_minutes, fragmentation_index')
                    .eq('sleep_record_id', recordId)
                    .single();

                  if (error || !data) {
                    console.error('Error fetching Sleep Quality metrics:', error);
                    return;
                  }

                  const sol = data.sol_seconds ? data.sol_seconds / 60 : 0;
                  const waso = data.waso_minutes || 0;
                  const fi = data.fragmentation_index ? data.fragmentation_index * 100 : 0;

                  setModalTitle('Sleep Quality Raw Data');
                  setModalData([]); // No usamos esta tabla, solo extraContent

                  setModalExtraContent(
                    <View>
                      <View style={styles.modalTableContainer}>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalHeaderCell}>Metric</Text>
                          <Text style={styles.modalHeaderCell}>Value</Text>
                        </View>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalCell}>Sleep Onset Latency (SOL)</Text>
                          <Text style={styles.modalCell}>{sol.toFixed(1)} min</Text>
                        </View>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalCell}>Wake After Sleep Onset (WASO)</Text>
                          <Text style={styles.modalCell}>{waso} min</Text>
                        </View>
                        <View style={styles.modalRow}>
                          <Text style={styles.modalCell}>Fragmentation Index (FI)</Text>
                          <Text style={styles.modalCell}>{fi.toFixed(1)}%</Text>
                        </View>
                      </View>

                      <Text style={styles.modalInfoText}>
                        ───────────────────────────────{"\n"}
                        <Text style={styles.modalBoldText}>SOL:</Text>{" "}
                        Time difference between the beginning of the session and the first detected sleep period.{"\n"}
                        ───────────────────────────────{"\n"}
                        <Text style={styles.modalBoldText}>WASO:</Text>{" "}
                        Count of all 1-minute epochs labeled as wake *after* sleep onset.{"\n"}
                        ───────────────────────────────{"\n"}
                        <Text style={styles.modalBoldText}>FI:</Text>{" "}
                        Calculated as the number of sleep/wake transitions divided by the total number of epochs.{"\n"}
                        {"\n"}FI = transitions / total_epochs × 100%
                        ───────────────────────────────
                      </Text>
                    </View>
                  );

                  setModalVisible(true);
                }}
              >
                <Text style={styles.showDataButtonText}>Show data</Text>
              </TouchableOpacity>
            )}
            </View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={styles.chartScrollContent}
            >
              <View style={styles.chartWrapper}>
                {cat === 'Heart Rate' && recordId && (
                  <HeartRateChart sleepRecordId={parseInt(recordId)} />
                )}
                {cat === 'Accelerometer' && recordId && (
                  <AccelerometerChart sleepRecordId={parseInt(recordId)} />
                )}
                {cat === 'Cole-Kripke' && recordId && (
                  <CKClassificationChart sleepRecordId={parseInt(recordId)} />
                )}
                {cat === 'Sleep Stages' && recordId && (
                  <SleepStagesChart sleepRecordId={parseInt(recordId)} />
                )} 
                {cat === 'HRV' && recordId && (
                  <HrvChart sleepRecordId={parseInt(recordId)} />
                )}
                {cat === 'Sleep Quality' && recordId && (
                  <SleepQualityChart sleepRecordId={parseInt(recordId)} />
                )}
              </View>
            </ScrollView>
          </View>
      ))}
    </ScrollView>
    <DataModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={modalTitle}
        data={modalData}
        extraContent={modalExtraContent}
      />
    </>
  )
}

export default StatisticsScreen;