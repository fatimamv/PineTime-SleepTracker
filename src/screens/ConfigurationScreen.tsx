import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { useBluetooth } from '../context/BluetoothContext';
import { useConfig } from '../context/ConfigContext';

const manager = new BleManager();

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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Configuration</Text>

      <Text style={styles.subHeader}>Collecting configuration</Text>

      <View style={styles.rowContainer}>
        <Text style={styles.label}>Metrics:</Text>
        <Text style={styles.label}>Frequency:</Text>
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

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Save configuration</Text>
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

const styles = StyleSheet.create({
  container: { padding: 20 },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  subHeader: { fontSize: 18, fontWeight: '500', marginTop: 20, marginBottom: 10 },
  rowContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  label: { fontSize: 16, fontWeight: '600' },
  metricRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  metricLabel: { flex: 1, fontSize: 16 },
  freqInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 6,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  unit: { fontSize: 16 },
  saveButton: {
    backgroundColor: '#4CBAE6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  deviceItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
  },
  connectedStatus: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
});

export default ConfigurationScreen;
