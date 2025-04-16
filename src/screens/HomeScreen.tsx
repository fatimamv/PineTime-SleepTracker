import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, PermissionsAndroid, Platform, TouchableOpacity, Modal, Button, TextInput } from 'react-native';
import { ScreenComponent } from './types';
import { checkConnection, startDataCollection } from '../utils/BluetoothManager';
import { createSleepRecord } from '../utils/BluetoothManager'; 
import { supabase } from '../api/supabaseClient';
console.log('👀 Supabase URL:', supabase);
import { Picker } from '@react-native-picker/picker';
import { useBluetooth } from '../context/BluetoothContext';
import { useRef } from 'react';
import { Subscription } from 'react-native-ble-plx'; 
import { useConfig } from '../context/ConfigContext';


interface User {
  id: number;
  name: string;
}

const HomeScreen: ScreenComponent = () => {
  const [hasPermission, setHasPermission] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const { connectedDevice, setConnectedDevice } = useBluetooth();
  const collectionSubscriptions = useRef<{ accel: Subscription | null; hr: Subscription | null }>({
    accel: null,
    hr: null,
  });
  const cleanupRef = useRef<(() => void) | null>(null);
  

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
    setIsConnected(connectedDevice !== null);
  }, [connectedDevice]);
  
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

  const handleStartCollection = async () => {
    if (!isConnected) return;
    
    setIsCollecting(true);

    const sleepRecordId = await createSleepRecord(1); // usa el ID real del usuario
    if (!sleepRecordId || !connectedDevice) {
      Alert.alert('Error', 'Sleep record not created or device not connected.');
      setIsCollecting(false);
      return;
    }
  
    const success = await startDataCollection(connectedDevice, sleepRecordId, accelFreqMs, hrFreqMs, (accelSub, hrSub) => {
      collectionSubscriptions.current = { accel: accelSub, hr: hrSub };
    });
    
    if (!success) {
      Alert.alert(
        'Error',
        'Failed to start data collection. Please try again.',
        [{ text: 'OK' }]
      );
      setIsCollecting(false);
    }
  };

  const startExtractionWithUser = async (userId: number) => {
    console.log('⏳ Creating sleep record...');
    const sleepRecordId = await createSleepRecord(userId);
    console.log('🚀 Calling startDataCollection with ID:', sleepRecordId);
    
    if (!sleepRecordId) {
      console.error('❌ No sleep record ID created');
      return;
    }
    
    if (!connectedDevice) {
      console.error('❌ No connected device');
      return;
    }

    console.log('📱 Starting data collection with device:', connectedDevice.name);
    try {
      const startedCleanup = await startDataCollection(connectedDevice, sleepRecordId, accelFreqMs, hrFreqMs, (accelSub, hrSub) => {
        collectionSubscriptions.current = { accel: accelSub, hr: hrSub };
      });
      
      if (startedCleanup) {
        cleanupRef.current?.(); // Limpia suscripciones anteriores si había
        cleanupRef.current = startedCleanup; // Guarda la nueva cleanup
        setIsCollecting(true);
        console.log('✅ Extraction started successfully');
      } else {
        console.error('❌ Failed to start extraction');
      }      
    } catch (error) {
      console.error('💥 Error in startDataCollection:', error);
    }
  };

  const stopDataCollection = () => {
    console.log('🛑 Stopping data collection...');
    collectionSubscriptions.current.accel?.remove();
    collectionSubscriptions.current.hr?.remove();
    cleanupRef.current?.(); // Esto corta el keep-alive y monitoreo BLE
    collectionSubscriptions.current = { accel: null, hr: null };
    cleanupRef.current = null;
    setIsCollecting(false);
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
        disabled={!isConnected}
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
                await startExtractionWithUser(userId);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusContainer: {
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    marginHorizontal: 20,
    marginBottom: 30,
  },
  statusContainerNotConnected: {
    backgroundColor: '#FFEBEE',
  },
  status: {
    fontSize: 16,
    color: '#2E7D32',
  },
  statusNotConnected: {
    color: '#C62828',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonDisabled: {
    backgroundColor: '#BDBDBD',
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 30,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: 'Roboto',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    fontFamily: 'Roboto',
  },
  buttonPrimary: {
    backgroundColor: '#4CBAE6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    elevation: 2,
  },
  buttonPrimaryText: {
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'Roboto',
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 10,
    alignItems: 'center',
  },
  bottomButtonContainer: {
    paddingBottom: 40,
    alignItems: 'center',
  },
});

export default HomeScreen;