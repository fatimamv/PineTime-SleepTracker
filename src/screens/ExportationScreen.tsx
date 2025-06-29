import React, { useState } from 'react';
import { View, ScrollView, Alert, Platform, TouchableOpacity, PermissionsAndroid, NativeModules } from 'react-native';
import { Text, Checkbox, TextInput, Button, Menu, Provider } from 'react-native-paper';
import DatePicker from 'react-native-date-picker';
import RNFS from 'react-native-fs';
import { supabase } from '../api/supabaseClient';
import styles from './styles';
import Share from 'react-native-share';
import {Picker} from '@react-native-picker/picker';
import { zip } from 'react-native-zip-archive';
import { COLORS } from '../constants/theme';
import Icon from 'react-native-vector-icons/Feather';

interface SleepRecord {
  id: string;
  start_time: string;
  end_time: string;
  user_id: string;
  total_sleep_time?: number;
  heart_rate?: number;
  hrv?: number;
  accelerometer?: any;
}

const ExportationScreen = () => {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [fileFormat, setFileFormat] = useState<'csv' | 'json'>('csv');
  const [openStart, setOpenStart] = useState(false);
  const [openEnd, setOpenEnd] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [availableRecordIds, setAvailableRecordIds] = useState<number[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [availableMetrics, setAvailableMetrics] = useState<{[key: string]: boolean}>({});

  const metricsList = [
    { label: 'Heart Rate', value: 'heart_rate' },
    { label: 'Accelerometer', value: 'accelerometer' },
    { label: 'Cole-Kripke', value: 'cole_kripke' },
    { label: 'Sleep Stages', value: 'sleep_stages' },
    { label: 'HRV', value: 'hrv' },
    { label: 'Sleep Quality', value: 'sleep_quality' },
  ];

  const toggleMetric = (metric: string) => {
    if (!availableMetrics[metric]) return; // Only allow toggling if metric is available
    
    setSelectedMetrics(prev =>
      prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]
    );
  };

  const checkMetricsAvailability = async (recordId: number) => {
    const availability: {[key: string]: boolean} = {};
    
    try {
      // Check Heart Rate availability
      const { data: hrData } = await supabase
        .from('raw_sensor_data')
        .select('id')
        .eq('sleep_record_id', recordId)
        .eq('sensor_type', 'heart_rate')
        .limit(1);
      availability.heart_rate = !!(hrData && hrData.length > 0);

      // Check Accelerometer availability
      const { data: accData } = await supabase
        .from('raw_sensor_data')
        .select('id')
        .eq('sleep_record_id', recordId)
        .eq('sensor_type', 'accelerometer')
        .limit(1);
      availability.accelerometer = !!(accData && accData.length > 0);

      // Check Cole-Kripke availability
      const { data: ckData } = await supabase
        .from('sleep_classification')
        .select('id')
        .eq('sleep_record_id', recordId)
        .limit(1);
      availability.cole_kripke = !!(ckData && ckData.length > 0);

      // Check Sleep Stages availability
      const { data: stagesData } = await supabase
        .from('sleep_stages')
        .select('id')
        .eq('sleep_record_id', recordId)
        .limit(1);
      availability.sleep_stages = !!(stagesData && stagesData.length > 0);

      // Check HRV availability
      const { data: hrvData } = await supabase
        .from('sleep_metrics')
        .select('hrv_rmssd, hrv_sdnn')
        .eq('sleep_record_id', recordId)
        .single();
      availability.hrv = !!(hrvData && (hrvData.hrv_rmssd !== null || hrvData.hrv_sdnn !== null));

      // Check Sleep Quality availability
      const { data: qualityData } = await supabase
        .from('sleep_metrics')
        .select('sol_seconds, waso_minutes, fragmentation_index')
        .eq('sleep_record_id', recordId)
        .single();
      availability.sleep_quality = !!(qualityData && (
        qualityData.sol_seconds !== null || 
        qualityData.waso_minutes !== null || 
        qualityData.fragmentation_index !== null
      ));

      setAvailableMetrics(availability);
      
      // Auto-select available metrics
      const availableMetricsList = Object.keys(availability).filter(key => availability[key]);
      setSelectedMetrics(availableMetricsList);
      
    } catch (error) {
      console.error('Error checking metrics availability:', error);
    }
  };

  const validateDates = () => {
    if (!startDate || !endDate) {
      Alert.alert('Error', 'Please select a date range');
      return false;
    }

    if (startDate > endDate) {
      Alert.alert('Error', 'The start date must be before the end date');
      return false;
    }

    return true;
  };
  
  const fetchAvailableSleepRecords = async () => {
  
    const { data, error } = await supabase
      .from('sleep_records')
      .select('id')
      .gte('created_at', startDate!.toISOString())
      .lte('created_at', endDate!.toISOString());
  
    if (error) {
      console.error('Error fetching records:', error);
      return;
    }
  
    setAvailableRecordIds(data.map((r: any) => r.id));
    setSelectedRecordId(null); 
  };
  
  const calculateMetrics = async (sleepRecordId: number) => {
    if (isCalculating) return; // Prevent multiple simultaneous calculations
    
    setIsCalculating(true);
    try {
      console.log('🔄 Attempting to calculate metrics for record:', sleepRecordId);
      
      // Check if metrics already exist
      const { data: existingMetrics } = await supabase
        .from('sleep_metrics')
        .select('id')
        .eq('sleep_record_id', sleepRecordId)
        .limit(1);

      if (existingMetrics && existingMetrics.length > 0) {
        console.log('✅ Metrics already exist for record:', sleepRecordId);
        setIsCalculating(false);
        return;
      }

      // Call the backend to calculate metrics
      const res = await fetch('https://6920-2a02-3033-680-52f-b57c-3200-bc46-c0e2.ngrok-free.app/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sleep_record_id: sleepRecordId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const json = await res.json();
      console.log('✅ Metrics calculation response:', json);
      
    } catch (err: any) {
      console.error('❌ Error calculating metrics:', err);
      Alert.alert(
        'Calculation Error', 
        'Could not calculate metrics. The ngrok URL may have changed or the server may be unavailable. Please try again later.'
      );
    } finally {
      setIsCalculating(false);
    }
  };

  const formatData = (data: any[], format: 'csv' | 'json') => {
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }
  
    if (data.length === 0) return '';
  
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(header => row[header]).join(','))
    ];
  
    return csvRows.join('\n');
  };

  const handleExport = async () => {
    if (!validateDates() || selectedMetrics.length === 0) {
      Alert.alert('Error', 'Please select metrics and a valid date range');
      return;
    }
  
    if (!selectedRecordId) {
      Alert.alert('Error', 'Please select a sleep record ID');
      return;
    }

    setIsExporting(true);
  
    try {
      const zipFolderPath = `${RNFS.DocumentDirectoryPath}/export_${selectedRecordId}`;
      const zipPath = `${RNFS.DocumentDirectoryPath}/export_${selectedRecordId}.zip`;
  
      // Delete previous files if they exist
      if (await RNFS.exists(zipPath)) {
        await RNFS.unlink(zipPath); // delete the .zip if it exists
      }
      if (await RNFS.exists(zipFolderPath)) {
        await RNFS.unlink(zipFolderPath); // delete the entire folder if it exists
      }
      await RNFS.mkdir(zipFolderPath);
      
  
      // ---------- HEART RATE ----------
      if (selectedMetrics.includes('heart_rate')) {
        const { data: hrData, error: hrError } = await supabase
          .from('raw_sensor_data')
          .select('value, captured_at')
          .eq('sleep_record_id', selectedRecordId)
          .eq('sensor_type', 'heart_rate');
  
        if (!hrError && hrData) {
          const processed = hrData.map(d => {
            const parsed = JSON.parse(d.value);
            return {
              time: new Date(d.captured_at).toISOString(),
              heart_rate: parsed.heartRate,
            };
          });
  
          const content = formatData(processed, fileFormat);
          const path = `${zipFolderPath}/heart_rate.${fileFormat}`;
          await RNFS.writeFile(path, content, 'utf8');
        }
      }
  
      // ---------- ACCELEROMETER ----------
      if (selectedMetrics.includes('accelerometer')) {
        const { data: accData, error: accError } = await supabase
          .from('raw_sensor_data')
          .select('value, captured_at')
          .eq('sleep_record_id', selectedRecordId)
          .eq('sensor_type', 'accelerometer');
  
        if (!accError && accData) {
          const processed = accData.map(d => {
            const parsed = JSON.parse(d.value);
            return {
              time: new Date(d.captured_at).toISOString(),
              x: parsed.x,
              y: parsed.y,
              z: parsed.z,
            };
          });
  
          const content = formatData(processed, fileFormat);
          const path = `${zipFolderPath}/accelerometer.${fileFormat}`;
          await RNFS.writeFile(path, content, 'utf8');
        }
      }

      // ---------- COLE-KRIPEK ----------
      if (selectedMetrics.includes('cole_kripke')) {
        const { data: ckData, error: ckError } = await supabase
          .from('sleep_classification')
          .select('timestamp, state')
          .eq('sleep_record_id', selectedRecordId);
      
        if (!ckError && ckData) {
          const processed = ckData
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .map(d => ({
              time: new Date(d.timestamp).toISOString(),
              state: d.state === 0 ? '0 = Sleep' : '1 = Awake',
            }));
      
          const content = formatData(processed, fileFormat);
          const path = `${zipFolderPath}/cole_kripke.${fileFormat}`;
          await RNFS.writeFile(path, content, 'utf8');
        }
      }
      
      // ---------- SLEEP STAGES ----------
      if (selectedMetrics.includes('sleep_stages')) {
        const { data: stagesData, error: stagesError } = await supabase
          .from('sleep_stages')
          .select('stage, start_time, end_time')
          .eq('sleep_record_id', selectedRecordId)
          .order('start_time', { ascending: true });
      
        if (!stagesError && stagesData) {
          const processed = stagesData.map(d => ({
            time: `${new Date(d.start_time).toISOString()} - ${new Date(d.end_time).toISOString()}`,
            stage: d.stage,
            duration_min: Math.round((new Date(d.end_time).getTime() - new Date(d.start_time).getTime()) / 1000 / 60),
          }));
      
          const content = formatData(processed, fileFormat);
          const path = `${zipFolderPath}/sleep_stages.${fileFormat}`;
          await RNFS.writeFile(path, content, 'utf8');
        }
      }

      // ---------- HRV ----------
      if (selectedMetrics.includes('hrv')) {
        const { data: hrvData, error: hrvError } = await supabase
          .from('sleep_metrics')
          .select('hrv_rmssd, hrv_sdnn')
          .eq('sleep_record_id', selectedRecordId)
          .single();
      
        if (!hrvError && hrvData) {
          const processed = [
            { metric: 'RMSSD', value: hrvData.hrv_rmssd },
            { metric: 'SDNN', value: hrvData.hrv_sdnn },
          ];
      
          const content = formatData(processed, fileFormat);
          const path = `${zipFolderPath}/hrv.${fileFormat}`;
          await RNFS.writeFile(path, content, 'utf8');
        }
      }

      // ---------- SLEEP QUALITY ----------
      if (selectedMetrics.includes('sleep_quality')) {
        const { data: qualityData, error: qualityError } = await supabase
          .from('sleep_metrics')
          .select('sol_seconds, waso_minutes, fragmentation_index')
          .eq('sleep_record_id', selectedRecordId)
          .single();
      
        if (!qualityError && qualityData) {
          const sol = qualityData.sol_seconds ? qualityData.sol_seconds / 60 : 0;
          const waso = qualityData.waso_minutes || 0;
          const fi = qualityData.fragmentation_index ? qualityData.fragmentation_index * 100 : 0;
      
          const processed = [
            { metric: 'Sleep Onset Latency (SOL)', value: `${sol.toFixed(1)} min` },
            { metric: 'Wake After Sleep Onset (WASO)', value: `${waso} min` },
            { metric: 'Fragmentation Index (FI)', value: `${fi.toFixed(1)}%` },
          ];
      
          const content = formatData(processed, fileFormat);
          const path = `${zipFolderPath}/sleep_quality.${fileFormat}`;
          await RNFS.writeFile(path, content, 'utf8');
        }
      }
      
      // Zip and share
      const zipped = await zip(zipFolderPath, zipPath);
      const base64Zip = await RNFS.readFile(zipped, 'base64');
  
      await Share.open({
        url: `data:application/zip;base64,${base64Zip}`,
        type: 'application/zip',
        title: 'Exported Sleep Data',
        message: 'Here is your sleep data export in ZIP format.',
      });
  
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsExporting(false);
    }
  };
  

  return (
    <Provider>
      <ScrollView 
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Exportation File</Text>
          {isCalculating && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
              <Icon name="loader" size={16} color={COLORS.primary} style={{ marginRight: 8 }} />
              <Text style={{ color: COLORS.primary, fontSize: 12 }}>Calculating metrics...</Text>
            </View>
          )}
        </View>

        <Text style={{...styles.subHeader, marginBottom: 10}}>Choose the dates you need</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity 
            style={styles.dateInput}
            onPress={() => setOpenStart(true)}
          >
            <View style={styles.dateInputContent}>
              <Text style={{
                color: startDate ? COLORS.text.primary : COLORS.text.secondary
              }}>
                {startDate ? startDate.toLocaleDateString() : 'From'}
              </Text>
              <Icon name="calendar" size={16} color={COLORS.text.secondary} />
            </View>
          </TouchableOpacity>
          <Text style={{ color: COLORS.text.primary }}> — </Text>
          <TouchableOpacity 
            style={styles.dateInput}
            onPress={() => setOpenEnd(true)}
          >
            <View style={styles.dateInputContent}>
              <Text style={{
                color: endDate ? COLORS.text.primary : COLORS.text.secondary
              }}>
                {endDate ? endDate.toLocaleDateString() : 'To'}
              </Text>
              <Icon name="calendar" size={16} color={COLORS.text.secondary} />
            </View>
          </TouchableOpacity>
        </View>

        <DatePicker
          modal
          mode="date"
          open={openStart}
          date={startDate || new Date()}
          onCancel={() => setOpenStart(false)}
          onConfirm={(date: Date) => {
            setOpenStart(false);
            setStartDate(date);
            if (startDate && endDate) fetchAvailableSleepRecords();
          }}
        />
        <DatePicker
          modal
          mode="date"
          open={openEnd}
          date={endDate || new Date()}
          onConfirm={(date: Date) => {
            setOpenEnd(false);
            setEndDate(date);
            if (startDate && endDate) fetchAvailableSleepRecords();
          }}
          onCancel={() => setOpenEnd(false)}
        />

        {availableRecordIds.length > 0 && (
          <View >
            <Text style={{...styles.subHeader, marginTop: 20, marginBottom: 10}}>Select a Sleep Record ID</Text>
            <Picker
              selectedValue={selectedRecordId}
              onValueChange={async (itemValue) => {
                setSelectedRecordId(itemValue);
                if (itemValue) {
                  // Check if metrics exist for this record
                  const { data: existingMetrics } = await supabase
                    .from('sleep_metrics')
                    .select('id')
                    .eq('sleep_record_id', itemValue)
                    .limit(1);

                  if (!existingMetrics || existingMetrics.length === 0) {
                    console.log('🔄 No metrics found for record, triggering calculation');
                    calculateMetrics(itemValue);
                  }
                  
                  // Check metrics availability for this record
                  await checkMetricsAvailability(itemValue);
                } else {
                  setSelectedMetrics([]);
                  setAvailableMetrics({});
                }
              }}
              style={{ ...styles.picker, color: COLORS.text.primary, paddingVertical: 0}}
              dropdownIconColor={COLORS.text.primary}
            >
              <Picker.Item label="Select..." value={null} />
              {availableRecordIds.map((id) => (
                <Picker.Item key={id} label={`ID: ${id}`} value={id} />
              ))}
            </Picker>
          </View>
        )}

        {selectedRecordId && (
          <>
            <Text style={{...styles.subHeader, marginTop: 20}}>Choose the metrics you want to export</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between'}}>
              <View style={{ flex: 1, marginRight: 10 }}>
                {metricsList.slice(0, 3).map(metric => (
                  <View key={metric.value} style={styles.checkboxRow}>
                    <Checkbox
                      status={selectedMetrics.includes(metric.value) ? 'checked' : 'unchecked'}
                      onPress={() => toggleMetric(metric.value)}
                      color={availableMetrics[metric.value] ? COLORS.primary : COLORS.text.secondary}
                      disabled={!availableMetrics[metric.value]}
                    />
                    <Text style={[
                      styles.checkboxLabel, 
                      !availableMetrics[metric.value] && { color: COLORS.text.secondary }
                    ]}>
                      {metric.label}
                      {!availableMetrics[metric.value] && ' (Not available)'}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                {metricsList.slice(3, 6).map(metric => (
                  <View key={metric.value} style={styles.checkboxRow}>
                    <Checkbox
                      status={selectedMetrics.includes(metric.value) ? 'checked' : 'unchecked'}
                      onPress={() => toggleMetric(metric.value)}
                      color={availableMetrics[metric.value] ? COLORS.primary : COLORS.text.secondary}
                      disabled={!availableMetrics[metric.value]}
                    />
                    <Text style={[
                      styles.checkboxLabel, 
                      !availableMetrics[metric.value] && { color: COLORS.text.secondary }
                    ]}>
                      {metric.label}
                      {!availableMetrics[metric.value] && ' (Not available)'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        <Text style={{...styles.subHeader, marginTop: 25, marginBottom: 10}}>Choose the file format</Text>
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <TouchableOpacity 
              style={{...styles.dateInput, width:'100%'}}
              onPress={() => setMenuVisible(true)}
            >
              <View style={styles.dateInputContent}>
                <Text style={{
                  color: fileFormat ? COLORS.text.primary : COLORS.text.secondary
                }}>
                  {fileFormat.toUpperCase()}
                </Text>
                <Icon name="chevron-down" size={16} color={COLORS.text.secondary} />
              </View>
            </TouchableOpacity>
          }
        >
          <Menu.Item onPress={() => { setFileFormat('csv'); setMenuVisible(false); }} title="CSV" />
          <Menu.Item onPress={() => { setFileFormat('json'); setMenuVisible(false); }} title="JSON" />
        </Menu>

        <TouchableOpacity 
          style={[styles.button, (isExporting || isCalculating) && styles.buttonDisabled, { marginTop: 35 }]} 
          onPress={handleExport} 
          disabled={isExporting || isCalculating}
        >
          <Text style={[styles.buttonText, (isExporting || isCalculating) && styles.buttonTextDisabled]}>
            {isCalculating ? 'Calculating metrics...' : isExporting ? 'Exporting...' : 'Export data'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Provider>
  );
};

export default ExportationScreen;