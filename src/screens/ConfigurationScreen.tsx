import React, { useState } from 'react';
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

const ConfigurationScreen = () => {
  const { connectedDevice, setConnectedDevice } = useBluetooth();
  const { accelFrequency, hrFrequency, setConfig } = useConfig();

  const [localAccel, setLocalAccel] = useState(accelFrequency.toString());
  const [localHR, setLocalHR] = useState(hrFrequency.toString());
  const [devices, setDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);

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
      Alert.alert('Success', `Connected to ${device.name}`);
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
    Alert.alert('✅ Configuration saved');
  };

  return (
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

      <Text style={styles.subHeader}>Bluetooth Connection</Text>
      <TouchableOpacity
        style={[styles.button, isScanning && styles.buttonDisabled]}
        onPress={startScan}
        disabled={isScanning}
      >
        <Text style={styles.buttonText}>{isScanning ? 'Scanning...' : 'Scan for devices'}</Text>
      </TouchableOpacity>

      {devices.map((device) => (
        <TouchableOpacity
          key={device.id}
          style={styles.deviceItem}
          onPress={() => connectToDevice(device)}
        >
          <Text>{device.name || 'Unnamed device'}</Text>
          <Text style={styles.deviceId}>{device.id}</Text>
        </TouchableOpacity>
      ))}

      {connectedDevice && (
        <View style={styles.connectedStatus}>
          <Text>Connected to: {connectedDevice.name}</Text>
        </View>
      )}
    </ScrollView>
  );
};

export default ConfigurationScreen;
