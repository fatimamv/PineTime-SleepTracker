import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, PermissionsAndroid, Platform, TouchableOpacity, Modal, Button, TextInput } from 'react-native';
import { ScreenComponent } from './types';
import { ensurePineTime, startCollection } from '../utils/BluetoothManager';
import { supabase } from '../api/supabaseClient';
console.log('👀 Supabase URL:', supabase);
import { Picker } from '@react-native-picker/picker';
import { useBluetooth } from '../context/BluetoothContext';
import { useRef } from 'react';
import { Subscription } from 'react-native-ble-plx'; 
import { useConfig } from '../context/ConfigContext';
import styles from './styles';

interface User {
  id: number;
  name: string;
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
  const collectionSubscriptions = useRef<{ accel: Subscription | null; hr: Subscription | null }>({
    accel: null,
    hr: null,
  });
  const cleanupRef = useRef<(() => void) | null>(null);
  const isConnected = !!connectedDevice; 
  

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
      const usersFromDB = await getUsers();  // This is the function we created to get the users
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
    cleanupRef.current?.(); // Esto corta el keep-alive y monitoreo BLE
    collectionSubscriptions.current = { accel: null, hr: null };
    cleanupRef.current = null;
    setIsCollecting(false);
    if (sleepRecordId) {
      try {
        // 1. Actualiza ended_at
        const { error: updateError } = await supabase
          .from('sleep_records')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', sleepRecordId);
        if (updateError) {
          console.error('❌ Error updating ended_at:', updateError.message);
        } else {
          console.log('🕓 ended_at actualizado para sleep_record_id:', sleepRecordId);
        }
    
        // 2. Llama al backend
        const res = await fetch('https://0346-2001-7c7-1180-821-3537-d759-4fcb-fe1a.ngrok-free.app/compute', {
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

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>PineTime Data</Text>
        <View style={[styles.statusContainer, !isConnected && styles.statusContainerNotConnected]}>
          <Text style={[styles.status, !isConnected && styles.statusNotConnected]}>
            {isConnected ? 'Connected to PineTime' : 'PineTime device not connected'}
          </Text>
        </View>
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
        <Text style={styles.buttonText}>
          {isCollecting ? 'Stop Data Collection' : 'Start Data Collection'}
        </Text>
      </TouchableOpacity>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Insert the <Text style={{ fontWeight: 'bold' }}>name</Text> of the person wearing the PineTime to start
            </Text>

            {!isNewUser ? (
              <Picker
                selectedValue={selectedUser}
                onValueChange={(value: string) => {
                  setSelectedUser(value);
                  if (value === 'new') {
                    setIsNewUser(true);
                  }
                }}
              >
                {users.map((u: User) => (
                  <Picker.Item key={u.id} label={u.name} value={u.name} />
                ))}
                <Picker.Item label="Add new person..." value="new" />
              </Picker>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Enter new user name"
                value={newUserName}
                onChangeText={setNewUserName}
              />
            )}

            <TouchableOpacity
              style={styles.buttonPrimary}
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

            <TouchableOpacity
              onPress={() => setIsModalVisible(false)}
              style={styles.cancelButton}
            >
              <Text style={{ color: '#999' }}>Cancel</Text>
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