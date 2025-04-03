import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, PermissionsAndroid, Platform, TouchableOpacity, Modal, Button, TextInput } from 'react-native';
import { ScreenComponent } from './types';
import { checkConnection, startDataCollection } from '../utils/BluetoothManager';
import { createSleepRecord } from '../utils/BluetoothManager'; // ajusta el path si lo mueves
import { supabase } from '../api/supabaseClient';
import { Picker } from '@react-native-picker/picker';

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
    const checkDeviceConnection = async () => {
      const connected = await checkConnection();
      setIsConnected(connected);
    };

    checkDeviceConnection();
    // Check connection status every 5 seconds
    const interval = setInterval(checkDeviceConnection, 5000);

    return () => clearInterval(interval);
  }, []);
  
  useEffect(() => {
    const fetchUsers = async () => {
      const usersFromDB = await getUsers();  // This is the function we created to get the users
      setUsers(usersFromDB);
    };
  
    fetchUsers();
  }, []);

  const handleStartCollection = async () => {
    if (!isConnected) return;
    
    setIsCollecting(true);

    const sleepRecordId = await createSleepRecord(1); // usa el ID real del usuario
    if (!sleepRecordId) {
      Alert.alert('Error', 'No se pudo crear el registro de sueño.');
      setIsCollecting(false);
      return;
    }
  
    const success = await startDataCollection(sleepRecordId);
    
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
    const sleepRecordId = await createSleepRecord(userId); // Aquí se usa el ID del usuario
    if (!sleepRecordId) return;
    await startDataCollection(sleepRecordId);
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
        <TouchableOpacity
          style={[
            styles.button,
            (!isConnected || isCollecting) && styles.buttonDisabled
          ]}
          onPress={handleStartCollection}
          disabled={!isConnected || isCollecting}
        >
          <Text style={styles.buttonText}>
            {isCollecting ? 'Collecting Data...' : 'Start New Extraction'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity onPress={() => setIsModalVisible(true)}>
        <Text>Start extracting data</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
      >
        <View style={styles.modalContainer}>
          {users.length === 0 ? (
            <Text>No users found. Please create a new user.</Text>
          ) : (
            <Picker
              selectedValue={selectedUser}
              onValueChange={(value: string) => setSelectedUser(value)}
            >
              {users.map((u: User) => (
                <Picker.Item key={u.id} label={u.name} value={u.name} />
              ))}
              <Picker.Item label="Add new user..." value="new" />
            </Picker>
          )}
          
          <Text>Select or enter name</Text>

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
              placeholder="Enter new user name"
              value={newUserName}
              onChangeText={setNewUserName}
            />
          )}

          <Button
            title="Continue"
            onPress={async () => {
              let userId;

              if (isNewUser && newUserName.trim()) {
                const user = await createUser(newUserName.trim());
                if (!user) return;
                userId = user.id;
              } else {
                const user = users.find((u: { id: number; name: string })  => u.name === selectedUser);
                if (!user) return;
                userId = user.id;
              }

              setIsModalVisible(false);
              startExtractionWithUser(userId);
            }}
          />

          <Button title="Cancel" onPress={() => setIsModalVisible(false)} />
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
  const { data, error } = await supabase
    .from('users')
    .insert({ name })
    .select()
    .single();

  if (error) {
    console.error('Error creating user:', error.message);
    return null;
  }
  return data;
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

export default HomeScreen;