import { BleManager, Device, Service, Characteristic } from 'react-native-ble-plx';
import { supabase } from '../api/supabaseClient';



const manager = new BleManager();

// InfiniTime service and characteristic UUIDs
const MOTION_SERVICE_UUID = '00030000-78fc-48fe-8e23-433b3a1942d0';
const ACCELEROMETER_CHARACTERISTIC_UUID = '00030001-78fc-48fe-8e23-433b3a1942d0';
const HEART_RATE_SERVICE_UUID = '0000180D-0000-1000-8000-00805f9b34fb';
const HEART_RATE_CHARACTERISTIC_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

let connectedDevice: Device | null = null;
let motionService: Service | null = null;
let heartRateService: Service | null = null;
let accelerometerCharacteristic: Characteristic | null = null;
let heartRateCharacteristic: Characteristic | null = null;

export const checkConnection = async (): Promise<boolean> => {
  try {
    const state = await manager.state();
    if (state !== 'PoweredOn') {
      return false;
    }

    // Get all connected devices
    const connectedDevices = await manager.connectedDevices([]);
    
    // Check if any PineTime device is connected
    const pineTimeDevice = connectedDevices.find(device => 
      device.name?.toLowerCase().includes('pinetime') || 
      device.name?.toLowerCase().includes('pine time')
    );

    if (pineTimeDevice) {
      connectedDevice = pineTimeDevice;
      
      // Discover services and characteristics
      await connectedDevice.discoverAllServicesAndCharacteristics();
      
      // Get all services
      const services = await connectedDevice.services();
      
      // Find motion service and characteristic
      motionService = services.find(s => s.uuid === MOTION_SERVICE_UUID) || null;
      if (motionService) {
        const motionCharacteristics = await motionService.characteristics();
        accelerometerCharacteristic = motionCharacteristics.find(c => c.uuid === ACCELEROMETER_CHARACTERISTIC_UUID) || null;
      }
      
      // Find heart rate service and characteristic
      heartRateService = services.find(s => s.uuid === HEART_RATE_SERVICE_UUID) || null;
      if (heartRateService) {
        const heartRateCharacteristics = await heartRateService.characteristics();
        heartRateCharacteristic = heartRateCharacteristics.find(c => c.uuid === HEART_RATE_CHARACTERISTIC_UUID) || null;
      }

      // Check if we found all required services and characteristics
      if (!motionService || !accelerometerCharacteristic || !heartRateService || !heartRateCharacteristic) {
        console.error('Required services or characteristics not found');
        return false;
      }

      return true;
    }
    
    // Reset device and characteristics if disconnected
    connectedDevice = null;
    motionService = null;
    heartRateService = null;
    accelerometerCharacteristic = null;
    heartRateCharacteristic = null;
    return false;
  } catch (error) {
    console.error('Error checking Bluetooth connection:', error);
    return false;
  }
};

export const createSleepRecord = async (userId: number): Promise<number | null> => {
  const sleepDate = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD

  const { data, error } = await supabase
    .from('sleep_records')
    .insert({
      user_id: userId,
      sleep_date: sleepDate,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating sleep record:', error.message);
    return null;
  }

  return data.id;
};

export const startDataCollection = async (sleepRecordId: number): Promise<boolean> => {
  try {
    if (!connectedDevice || !motionService || !heartRateService || 
        !accelerometerCharacteristic || !heartRateCharacteristic) {
      console.error('Device or characteristics not found');
      return false;
    }

    // Start accelerometer data collection
    await accelerometerCharacteristic.writeWithResponse(btoa('START'));

    // Start heart rate data collection
    await heartRateCharacteristic.writeWithResponse(btoa('START'));

    // Monitor accelerometer data
    accelerometerCharacteristic.monitor(async (error, characteristic) => {
      if (error) {
        console.error('Error monitoring accelerometer:', error);
        return;
      }
      if (characteristic?.value) {
        const rawData = atob(characteristic.value);
  
        const { error } = await supabase.from('raw_sensor_data').insert({
          sleep_record_id: sleepRecordId,
          sensor_type: 'accelerometer',
          value: rawData,
          captured_at: new Date().toISOString()
        });
  
        if (error) console.error('Error saving to Supabase:', error.message);
      }
    });

    // Monitor heart rate data
    heartRateCharacteristic.monitor(async (error, characteristic) => {
      if (error) {
        console.error('Error monitoring heart rate:', error);
        return;
      }
      if (characteristic?.value) {
        // Process heart rate data
        const rawData = atob(characteristic.value);
        const { error } = await supabase.from('raw_sensor_data').insert({
          sleep_record_id: sleepRecordId,
          sensor_type: 'heart_rate',
          value: rawData,
          captured_at: new Date().toISOString()
        });

        if (error) console.error('Error saving to Supabase:', error.message);
      }
    });

    return true;
  } catch (error) {
    console.error('Error starting data collection:', error);
    return false;
  }
};

export default manager;
