import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';  
import { useBluetooth } from '../context/BluetoothContext';
import { useConfig } from '../context/ConfigContext';
import manager from '../utils/BluetoothManager';
import type { Device } from 'react-native-ble-plx';
import styles from './styles';
import { COLORS } from '../constants/theme';

const ConfigurationScreen = () => {
  const { connectedDevice, setConnectedDevice } = useBluetooth();
  const { accelFrequency, hrFrequency, setConfig } = useConfig();

  const [localAccel, setLocalAccel] = useState(accelFrequency.toString());
  const [localHR, setLocalHR] = useState(hrFrequency.toString());
  const [devices, setDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // PIN Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinCode, setPinCode] = useState('');
  const CORRECT_PIN = '1234';

  const handlePinInput = (digit: string) => {
    if (pinCode.length < 4) {
      const newPin = pinCode + digit;
      setPinCode(newPin);
      
      if (newPin.length === 4) {
        if (newPin === CORRECT_PIN) {
          setIsAuthenticated(true);
          setPinCode('');
        } else {
          Alert.alert('Error', 'Incorrect PIN code');
          setPinCode('');
        }
      }
    }
  };

  const handlePinDelete = () => {
    setPinCode(pinCode.slice(0, -1));
  };

  const seen = new Set<string>();

  const startScan = () => {
    setDevices([]);
    setIsScanning(true);
    const foundDevices: Device[] = [];

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error(error);
        setIsScanning(false);
        return;
      }

      if (device?.name && !seen.has(device.id)) {
        seen.add(device.id);
        foundDevices.push(device);
        setDevices([...foundDevices]);
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      setIsScanning(false);
    }, 8000);
  };

  const connectToDevice = async (device: Device) => {
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
    } catch (err) {
      console.error('Connection error:', err);
      Alert.alert('Error', 'Failed to connect');
    }
  };

  const handleSave = () => {
    setConfig({
      accelFrequency: parseInt(localAccel),
      hrFrequency: parseInt(localHR),
    });
    Alert.alert('✅ Configuration saved', '', [
      {
        text: 'OK',
        onPress: () => {
          // Reset authentication to lock the screen again
          setIsAuthenticated(false);
          setPinCode('');
        }
      }
    ]);
  };

  return (
    <View style={styles.container}>
      {!isAuthenticated ? (
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { paddingTop: 40 }]}>
            <Text style={styles.modalTitle}>Enter PIN Code</Text>
            
            <View style={{ alignItems: 'center', marginVertical: 20 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[0, 1, 2, 3].map((index) => (
                  <View
                    key={index}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: index < pinCode.length ? COLORS.primary : COLORS.background.input,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  />
                ))}
              </View>
            </View>

            <View style={{ alignItems: 'center' }}>
              {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', 'del']].map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: 'row', marginBottom: 10 }}>
                  {row.map((digit, colIndex) => (
                    <TouchableOpacity
                      key={colIndex}
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 30,
                        backgroundColor: digit === 'del' ? COLORS.secondary : COLORS.background.input,
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginHorizontal: 5,
                      }}
                      onPress={() => {
                        if (digit === 'del') {
                          handlePinDelete();
                        } else if (digit !== '') {
                          handlePinInput(digit);
                        }
                      }}
                      disabled={digit === ''}
                    >
                      <Text style={{
                        fontSize: 20,
                        fontWeight: 'bold',
                        color: digit === 'del' ? COLORS.text.primary : COLORS.text.primary,
                      }}>
                        {digit === 'del' ? '⌫' : digit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.container, styles.contentContainer]}>
          <Text style={styles.title}>Configuration</Text>

          <Text style={styles.subHeader}>Collecting configuration</Text>

          <View style={styles.rowContainer}>
            <Text style={[styles.metricLabel, { fontWeight:600 }]}>Metrics:</Text>
            <Text style={styles.collectingLabel}>Frequency:</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Heart Rate</Text>
            <TextInput
              value={localHR}
              onChangeText={setLocalHR}
              keyboardType="numeric"
              style={styles.freqInput}
            />
            <Text style={styles.unit}>s</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Accelerometer</Text>
            <TextInput
              value={localAccel}
              onChangeText={setLocalAccel}
              keyboardType="numeric"
              style={styles.freqInput}
            />
            <Text style={styles.unit}>s</Text>
          </View>

          <TouchableOpacity style={[styles.button, { marginTop: 20 }]} onPress={handleSave}>
            <Text style={styles.buttonText}>Save configuration</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 15 }}>
            <Text style={[styles.subHeader, { marginTop: 15 }]}>Bluetooth Connection</Text>
            <TouchableOpacity
              style={[styles.button, isScanning && styles.buttonDisabled, { 
                paddingHorizontal: 15, 
                paddingVertical: 8,
                marginTop: 0 
              }]}
              onPress={startScan}
              disabled={isScanning}
            >
              <Text style={[styles.buttonText, isScanning && { color: COLORS.text.secondary }, { fontSize: 14 }]}>
                {isScanning ? 'Scanning...' : 'Scan for devices'}
              </Text>
            </TouchableOpacity>
          </View>

          {devices.map((device) => (
            <TouchableOpacity
              key={device.id}
              style={[
                styles.deviceItem,
                connectedDevice?.id === device.id && styles.deviceItemConnected
              ]}
              onPress={() => connectToDevice(device)}
            >
              <View>
                <Text>{device.name || 'Unnamed device'}</Text>
                <Text style={styles.deviceId}>{device.id}</Text>
              </View>
              {connectedDevice?.id === device.id && (
                <Text style={{ color: COLORS.primary, fontWeight: '600' }}>Connected</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

export default ConfigurationScreen;
