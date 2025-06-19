import React, { useEffect, useState } from 'react';
import { View, Text, Alert, PermissionsAndroid, Platform, TouchableOpacity, Modal, Button, TextInput } from 'react-native';
import { ScreenComponent } from './types';
import manager, { ensurePineTime, startCollection } from '../utils/BluetoothManager';
import { supabase } from '../api/supabaseClient';
console.log('👀 Supabase URL:', supabase);
import { Picker } from '@react-native-picker/picker';
import { useBluetooth } from '../context/BluetoothContext';
import { useRef } from 'react';
import { Subscription } from 'react-native-ble-plx'; 
import { useConfig } from '../context/ConfigContext';
import styles from './styles';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS, SPACING } from '../constants/theme';
import { format, isSameDay } from 'date-fns';
import { Calendar } from '../components/Calendar';

interface User {
  id: number;
  name: string;
}

interface SleepRecord {
  id: number;
  created_at: string;
  user_id: number;
  user_name?: string;
  total_sleep_time?: number | null;
}

const HomeScreen: ScreenComponent = () => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [sleepRecordId, setSleepRecordId] = useState<number | null>(null);
  const { connectedDevice, setConnectedDevice } = useBluetooth();
  const [availableRecords, setAvailableRecords] = useState<SleepRecord[]>([]);
  const [currentDateIndex, setCurrentDateIndex] = useState<number>(0);
  const collectionSubscriptions = useRef<{ accel: Subscription | null; hr: Subscription | null }>({
    accel: null,
    hr: null,
  });
  const cleanupRef = useRef<(() => void) | null>(null);
  const isConnected = !!connectedDevice; 
  const [availableMetrics, setAvailableMetrics] = useState<{[key: string]: boolean}>({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        console.log('Permissions granted:', granted);
        return (
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        console.log('ACCESS_FINE_LOCATION granted:', granted);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  };

  useEffect(() => {
    requestPermissions().then((granted) => {
      setHasPermission(granted);
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'Bluetooth permissions are required to use this app.',
          [{ text: 'OK' }]
        );
      }
    });
  }, []);

  useEffect(() => {
    const init = async () => {
      const device = await ensurePineTime();
      if (device) {
        setConnectedDevice(device);   // viene del BluetoothContext
      }
    };

    if (hasPermission) { init(); }
  }, [hasPermission]);
  
  useEffect(() => {
    const fetchUsers = async () => {
      const usersFromDB = await getUsers();  // This is the function created to get the users
      setUsers(usersFromDB);
    };
  
    fetchUsers();
  }, []);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { data, error } = await supabase.from('users').select('*').limit(1);
  
        if (error) {
          console.error('❌ Connection failed:', error.message);
          Alert.alert('Supabase error', error.message);
        } else {
          console.log('✅ Supabase connected, first user:', data);
          Alert.alert('Success', 'Connection to Supabase is working');
        }
      } catch (err: any) {
        console.error('💥 Exception:', err.message);
        Alert.alert('Exception', err.message);
      }
    };
  
    testConnection();
  }, []);

  useEffect(() => {
    const fetchAvailableDates = async () => {
      const { data, error } = await supabase
        .from('sleep_records')
        .select(`
          *,
          users(name),
          sleep_metrics(total_sleep_time)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching records:', error);
        return;
      }

      const records = data.map(record => ({
        id: record.id,
        created_at: record.created_at,
        user_id: record.user_id,
        user_name: record.users?.name,
        total_sleep_time: record.sleep_metrics?.[0]?.total_sleep_time
      }));

      setAvailableRecords(records);
      if (records.length > 0) {
        setCurrentDateIndex(0);
      }
    };

    fetchAvailableDates();
  }, []);

  useEffect(() => {
    const checkDataAvailability = async (id: number) => {
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

      metrics['Sleep Quality'] = Boolean(qualityData && 
        typeof qualityData.waso_minutes === 'number' && 
        typeof qualityData.fragmentation_index === 'number' && 
        typeof qualityData.sol_seconds === 'number');
        
      setAvailableMetrics(metrics);
    };

    if (availableRecords.length > 0 && currentDateIndex < availableRecords.length) {
      checkDataAvailability(availableRecords[currentDateIndex].id);
    }
  }, [availableRecords, currentDateIndex]);

  const handlePreviousDate = () => {
    if (currentDateIndex < availableRecords.length - 1) {
      const newIndex = currentDateIndex + 1;
      setCurrentDateIndex(newIndex);
      setSelectedDate(new Date(availableRecords[newIndex].created_at));
    }
  };

  const handleNextDate = () => {
    if (currentDateIndex > 0) {
      const newIndex = currentDateIndex - 1;
      setCurrentDateIndex(newIndex);
      setSelectedDate(new Date(availableRecords[newIndex].created_at));
    }
  };

  const handleMonthChange = (newDate: Date) => {
    setCurrentMonth(newDate);
  };

  const { accelFrequency, hrFrequency } = useConfig();
  const accelFreqMs = accelFrequency * 1000;
  const hrFreqMs = hrFrequency * 1000;

  const startCollectionForUser = async (userId: number) => {
    if (!connectedDevice) {
      Alert.alert('Error', 'PineTime no conectado');
      return;
    }
  
    try {
      const { subscriptions, cleanup, sleepRecordId } = await startCollection({
        device: connectedDevice,
        userId,
        accelEveryMs: accelFreqMs,
        hrEveryMs: hrFreqMs,
      });
      collectionSubscriptions.current = subscriptions;
      cleanupRef.current = cleanup;
      setIsCollecting(true);
      setSleepRecordId(sleepRecordId); 
    } catch (e: any) {
      console.error('❌ startCollection falló', e);
      const msg =
        e?.reason || e?.message || 'No se pudo iniciar la recolección de datos';
      Alert.alert('BLE error', msg);
    }
  };
  

  async function stopDataCollection() {
    console.log('🛑 Stopping data collection...');
    collectionSubscriptions.current.accel?.remove();
    collectionSubscriptions.current.hr?.remove();
    cleanupRef.current?.(); // This cuts the keep-alive and BLE monitoring
    collectionSubscriptions.current = { accel: null, hr: null };
    cleanupRef.current = null;
    setIsCollecting(false);
    if (sleepRecordId) {
      try {
        // 1. Update ended_at
        const { error: updateError } = await supabase
          .from('sleep_records')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', sleepRecordId);
        if (updateError) {
          console.error('❌ Error updating ended_at:', updateError.message);
        } else {
          console.log('🕓 ended_at actualizado para sleep_record_id:', sleepRecordId);
        }
    
        // 2. Call the backend
        const res = await fetch('https://a830-2a02-3033-680-4254-b069-427-9527-d5fe.ngrok-free.app/compute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sleep_record_id: sleepRecordId }),
        });
        const json = await res.json();
        console.log('✅ Backend response:', json);
      } catch (err) {
        console.error('💥 Error al calcular métricas:', err);
      }
    }
  };

  const formatSleepTime = (minutes: number | null | undefined) => {
    if (!minutes) return '—— ——';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')} h ${mins.toString().padStart(2, '0')} min`;
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    // Find the index of the record for the selected date
    const index = availableRecords.findIndex(record => 
      isSameDay(new Date(record.created_at), date)
    );
    if (index !== -1) {
      setCurrentDateIndex(index);
    }
  };

  return (
    <View style={styles.container}>
      {!isConnected && (
        <View style={styles.connectionBanner}>
          <Icon name="watch-variant" size={35} color="#fff" />
          <Text style={styles.connectionBannerText}>
            Your PineTime is not connected to your device. Check your Bluetooth configuration.
          </Text>
        </View>
      )}

      {availableRecords.length > 0 && (
        <>
          <View style={styles.dateNavigation}>
            <TouchableOpacity 
              onPress={handlePreviousDate}
              disabled={currentDateIndex === availableRecords.length - 1}
            >
              <Icon 
                name="chevron-left" 
                size={24} 
                color={currentDateIndex === availableRecords.length - 1 ? COLORS.disabled : COLORS.text.primary} 
                style={{ paddingHorizontal: 15 }}
              />
            </TouchableOpacity>
            
            <Text style={styles.dateText}>
              {format(new Date(availableRecords[currentDateIndex].created_at), 'MMMM do, yyyy')}
            </Text>
            
            <TouchableOpacity 
              onPress={handleNextDate}
              disabled={currentDateIndex === 0}
            >
              <Icon 
                name="chevron-right" 
                size={24} 
                style={{ paddingHorizontal: 15 }}
                color={currentDateIndex === 0 ? COLORS.disabled : COLORS.text.primary} 
              />
            </TouchableOpacity>
          </View>
          <View style={styles.recordInfo}>
            <Text style={styles.recordIDText}>
              Record ID: {availableRecords[currentDateIndex].id}  |  {availableRecords[currentDateIndex].user_name}
            </Text>
            <View style={[styles.rowContainer, { 
              justifyContent: 'center', 
              alignItems: 'center',
              paddingHorizontal: SPACING.lg,
              marginBottom: 0,
            }]}>
              <View style={styles.flexItem}>
                <View style={styles.sleepTimeCircle}>
                  <Text style={styles.sleepTimeText}>
                    Total Sleep Time:
                  </Text>
                  <Text style={[styles.sleepTimeText, { marginTop: 5, fontFamily: 'Roboto-Regular', fontSize: 20 }]}>
                    {formatSleepTime(availableRecords[currentDateIndex].total_sleep_time)}
                  </Text>
                </View>
              </View>
              <View style={styles.flexItem}>
                <View style={styles.availableMetricsContainer}>
                  <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 15 }}>Available Data</Text>
                  {['Heart Rate', 'Accelerometer', 'Cole-Kripke', 'Sleep Stages', 'HRV', 'Sleep Quality'].map((metric) => (
                    <View key={metric} style={[styles.metricRow, { marginBottom: 0, marginTop: 0 }]}>
                      <View style={[
                        styles.availabilityDot,
                        { backgroundColor: availableMetrics[metric] ? COLORS.primary : COLORS.disabled }
                      ]} />
                      <Text style={[
                        styles.metricText,
                        { color: availableMetrics[metric] ? COLORS.text.primary : COLORS.text.disabled }
                      ]}>
                        {metric}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
          <View style={styles.calendarContainer}>
            <Calendar 
              currentDate={currentMonth}
              availableDates={availableRecords.map(record => new Date(record.created_at))}
              selectedDate={selectedDate || new Date(availableRecords[currentDateIndex]?.created_at)}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
            />
          </View>
        </>
      )}

      <View style={styles.content}>
        <Text style={styles.subHeader}></Text>
      </View>
      
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
          style={[styles.button, !isConnected && styles.buttonDisabled]}
          onPress={async () => {
            if (isCollecting) {
              stopDataCollection();
            } else {
              setIsModalVisible(true);
            }
          }}
          disabled={!connectedDevice}
        >
          <Text style={[styles.buttonText, !isConnected && styles.buttonTextDisabled]}>
            {isCollecting ? 'Stop collection' : 'Start new extraction'}
          </Text>
        </TouchableOpacity>
        {!isConnected && (
          <Text style={styles.connectionMessage}>
            Connect your PineTime to proceed.
          </Text>
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { paddingTop: 60 }]}>
            <TouchableOpacity
              onPress={() => setIsModalVisible(false)}
              style={{
                position: 'absolute',
                top: 15,
                right: 15,
                zIndex: 1,
                padding: 0,
                backgroundColor: COLORS.background.input,
                borderRadius: 15,
                width: 30,
                height: 30,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: COLORS.text.primary, fontSize: 18, fontWeight: 'bold' }}>×</Text>
            </TouchableOpacity>
            
            <Text style={styles.modalTitle}>
              Insert the <Text style={{ fontWeight: 'bold' }}>name</Text> of the person wearing the PineTime to start
            </Text>

            {!isNewUser ? (
              <View>
                <Picker
                  selectedValue={selectedUser}
                  onValueChange={(value: string) => {
                    setSelectedUser(value);
                    if (value === 'new') {
                      setIsNewUser(true);
                    }
                  }}
                  style={styles.picker}
                  dropdownIconColor={COLORS.text.primary}
                >
                  <Picker.Item 
                    label="Select a user..." 
                    value="" 
                    color={COLORS.text.secondary}
                  />
                  {users.map((u: User) => (
                    <Picker.Item 
                      key={u.id} 
                      label={u.name} 
                      value={u.name}
                    />
                  ))}
                  <Picker.Item 
                    label="Add new person..." 
                    value="new"
                    color={COLORS.primary}
                  />
                </Picker>
              </View>
            ) : (
              <TextInput
                style={[styles.input, { width: '100%' }]}
                placeholder="Enter new user name"
                value={newUserName}
                onChangeText={setNewUserName}
                placeholderTextColor={COLORS.text.secondary}
              />
            )}

            <TouchableOpacity
              style={[styles.buttonPrimary, { marginTop: 25 }]}
              onPress={async () => {
                console.log('👉 Button pressed');
              
                let userId;
              
                if (isNewUser && newUserName.trim()) {
                  console.log('➕ Trying to create new user:', newUserName.trim());
                  const user = await createUser(newUserName.trim());
                  console.log('👤 User created:', user);
                  if (!user) {
                    Alert.alert('Error', 'Failed to create new user');
                    return;
                  }
                  userId = user.id;
                } else {
                  console.log('🔎 Searching for selected user:', selectedUser);
                  const user = users.find(u => u.name === selectedUser);
                  console.log('👤 User found:', user);
                  if (!user) {
                    Alert.alert('Error', 'Select a valid user');
                    return;
                  }
                  userId = user.id;
                }
              
                setIsModalVisible(false);
                console.log('📥 Starting extraction with userId:', userId);
                await startCollectionForUser(userId);
              }}
            >
              <Text style={styles.buttonPrimaryText}>Start extracting data</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const getUsers = async () => {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.error('Error fetching users:', error.message);
    return [];
  }
  return data;
};

export const createUser = async (name: string) => {
  console.log('🧪 Inserting user into Supabase...');

  try {
    const { data, error } = await supabase
      .from('users')
      .insert({ name })
      .select()
      .single();  

    console.log('🔁 Supabase insert response:', { data, error });

    if (error) {
      console.error('❌ Error creating user:', error.message);
      console.log('🧪 Full error object:', error);
      return null;
    }

    return data;
  } catch (err: any) {
    console.error('💥 Exception during insert:', err);
    Alert.alert('Exception', err.message || 'Unknown error');
    return null;
  }
};

export default HomeScreen;