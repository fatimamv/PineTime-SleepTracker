import { BleManager, Device, Service, Characteristic, Subscription } from 'react-native-ble-plx';
import { supabase } from '../api/supabaseClient';
import { useBluetooth } from '../context/BluetoothContext';

const manager = new BleManager();

// InfiniTime service and characteristic UUIDs
const MOTION_SERVICE_UUID = '00030000-78fc-48fe-8e23-433b3a1942d0';
const ACCELEROMETER_CHARACTERISTIC_UUID = '00030001-78fc-48fe-8e23-433b3a1942d0';
const HEART_RATE_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_CHARACTERISTIC_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

let motionService: Service | null = null;
let heartRateService: Service | null = null;
let accelerometerCharacteristic: Characteristic | null = null;
let heartRateCharacteristic: Characteristic | null = null;
let connectedDevice: Device | null = null;


export const checkConnection = async (
  onDeviceConnected: (device: Device) => void
): Promise<boolean> => {
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
      device.name?.toLowerCase().includes('pine time') ||
      device.name?.toLowerCase().includes('infinitime')
    );

    if (pineTimeDevice) {
      onDeviceConnected(pineTimeDevice);
      // Discover the services and characteristics of the connected device
      await pineTimeDevice.discoverAllServicesAndCharacteristics();
      
      // Get all services
      const services = await pineTimeDevice.services();
      console.log('🔍 Services found:', services.map(s => s.uuid));
      
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
      console.log('📦 Motion characteristic:', accelerometerCharacteristic?.uuid);
      console.log('📦 HR characteristic:', heartRateCharacteristic?.uuid);

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

export const startDataCollection = async (
  device: Device,
  sleepRecordId: number,
  accelFreqMs: number, 
  hrFreqMs: number,  
  onSubscription: (accelSub: Subscription, hrSub: Subscription) => void
): Promise<(() => void) | false> => {
  console.log('📡 Starting data collection with device:', device.name);
  
  try {
    // Discover services and characteristics
    console.log('🔍 Discovering services and characteristics...');
    await device.discoverAllServicesAndCharacteristics();
    
    // Get services
    const services = await device.services();
    console.log('📦 Available services:', services.map(s => s.uuid));
    
    // Find motion service
    const motionService = services.find(s => s.uuid.toLowerCase() === MOTION_SERVICE_UUID.toLowerCase());
    if (!motionService) {
      console.error('❌ Motion service not found. Looking for:', MOTION_SERVICE_UUID);
      console.log('📦 Available services:', services.map(s => s.uuid));
      return false;
    }
    
    // Get motion characteristics
    const motionCharacteristics = await motionService.characteristics();
    console.log('📦 Motion characteristics:', motionCharacteristics.map(c => c.uuid));
    
    // Find accelerometer characteristic
    const accelerometerCharacteristic = motionCharacteristics.find(c => c.uuid.toLowerCase() === ACCELEROMETER_CHARACTERISTIC_UUID.toLowerCase());
    if (!accelerometerCharacteristic) {
      console.error('❌ Accelerometer characteristic not found');
      return false;
    }

    // Try to activate accelerometer with different sequences
    try {
      console.log('🔔 Attempting to activate accelerometer...');
      
      // First, try to read the current value
      const currentValue = await accelerometerCharacteristic.read();
      console.log('📊 Current accelerometer value:', {
        base64: currentValue?.value,
        hex: Buffer.from(currentValue?.value || '', 'base64').toString('hex'),
        raw: Array.from(Buffer.from(currentValue?.value || '', 'base64'))
      });

      // Try different activation sequences for InfiniTime
      const activationSequences = [
        { name: 'Reset', value: Buffer.from([0x00]).toString('base64') },
        { name: 'Enable', value: Buffer.from([0x01]).toString('base64') },
        { name: 'Set Rate', value: Buffer.from([0x02]).toString('base64') }, // 10Hz
        { name: 'Start', value: Buffer.from([0x03]).toString('base64') }
      ];

      for (const sequence of activationSequences) {
        console.log(`🔄 Trying activation sequence: ${sequence.name}`);
        try {
          await accelerometerCharacteristic.writeWithResponse(sequence.value);
          console.log(`✅ Wrote ${sequence.name} sequence`);
          
          // Wait a bit and read the value again
          await new Promise(resolve => setTimeout(resolve, 1000));
          const newValue = await accelerometerCharacteristic.read();
          console.log('📊 New accelerometer value:', {
            base64: newValue?.value,
            hex: Buffer.from(newValue?.value || '', 'base64').toString('hex'),
            raw: Array.from(Buffer.from(newValue?.value || '', 'base64'))
          });
        } catch (error) {
          console.log(`⚠️ Failed to write ${sequence.name} sequence:`, error);
        }
      }

      // Enable notifications after activation attempts
      console.log('🔔 Enabling accelerometer notifications...');
      const accelSub = accelerometerCharacteristic.monitor(async (error, characteristic) => {
        if (error) {
          console.error('❌ Error in accelerometer monitor:', error);
          return;
        }
        if (characteristic?.value) {
          const buffer = Buffer.from(characteristic.value, 'base64');
          const timestamp = new Date().toISOString();
          
          // Log raw data for analysis
          console.log('🔍 Raw accelerometer data:', {
            timestamp,
            hex: buffer.toString('hex'),
            base64: characteristic.value,
            raw: Array.from(buffer),
            length: buffer.length
          });

          // Try to interpret the data
          if (buffer.length === 4) {
            // InfiniTime sends 4 bytes: x, y, z, w
            const x = buffer.readInt8(0);
            const y = buffer.readInt8(1);
            const z = buffer.readInt8(2);
            const w = buffer.readInt8(3);
            
            // Convert to g (assuming 2G range)
            const scale = 2.0 / 127.0;
            const x_g = x * scale;
            const y_g = y * scale;
            const z_g = z * scale;
            
            // Calculate magnitude and direction
            const magnitude = Math.sqrt(x_g * x_g + y_g * y_g + z_g * z_g);
            const direction = {
              x: x_g / magnitude,
              y: y_g / magnitude,
              z: z_g / magnitude
            };
            
            console.log('📈 Accelerometer data:', {
              timestamp,
              raw: { x, y, z, w },
              g: { x: x_g, y: y_g, z: z_g },
              magnitude,
              direction,
              hex: buffer.toString('hex')
            });

            // Save to Supabase
            const { error: dbError } = await supabase.from('raw_sensor_data').insert({
              sleep_record_id: sleepRecordId,
              sensor_type: 'accelerometer',
              value: JSON.stringify({
                raw: { x, y, z, w },
                g: { x: x_g, y: y_g, z: z_g },
                magnitude,
                direction,
                hex: buffer.toString('hex')
              }),
              captured_at: timestamp
            });

            if (dbError) {
              console.error('❌ Failed to insert accelerometer data:', dbError.message);
            } else {
              console.log('✅ Accelerometer data inserted successfully');
            }
          } else {
            console.log('⚠️ Unexpected buffer length:', buffer.length);
          }
        }
      });
      console.log('✅ Accelerometer notifications enabled');
    } catch (error) {
      console.error('❌ Failed to enable accelerometer notifications:', error);
      return false;
    }

    // Find heart rate service
    const heartRateService = services.find(s => s.uuid.toLowerCase() === HEART_RATE_SERVICE_UUID.toLowerCase());
    if (!heartRateService) {
      console.error('❌ Heart rate service not found');
      return false;
    }
    
    // Get heart rate characteristics
    const heartRateCharacteristics = await heartRateService.characteristics();
    console.log('📦 HR characteristics:', heartRateCharacteristics.map(c => c.uuid));
    
    // Find heart rate characteristic
    const heartRateCharacteristic = heartRateCharacteristics.find(c => c.uuid.toLowerCase() === HEART_RATE_CHARACTERISTIC_UUID.toLowerCase());
    if (!heartRateCharacteristic) {
      console.error('❌ Heart rate characteristic not found');
      return false;
    }

    console.log('✅ All required services and characteristics found');

    // Add connection monitoring
    const connectionMonitor = device.onDisconnected((error, device) => {
      console.log('⚠️ Device disconnected:', error?.message);
      // Attempt to reconnect
      device.connect()
        .then(device => {
          console.log('✅ Reconnected to device');
          return device.discoverAllServicesAndCharacteristics();
        })
        .catch(error => {
          console.error('❌ Failed to reconnect:', error);
        });
    });

    // Add keep-alive mechanism
    const keepAliveInterval = setInterval(async () => {
      try {
        // Read a characteristic to keep the connection alive
        if (heartRateCharacteristic) {
          await heartRateCharacteristic.read();
          console.log('💓 Keep-alive pulse sent');
        }
      } catch (error) {
        console.error('❌ Keep-alive failed:', error);
      }
    }, 30000); // Every 30 seconds

    // Cleanup function
    const cleanup = () => {
      clearInterval(keepAliveInterval);
      connectionMonitor.remove();
    };

    // Add timestamp tracking for data gaps
    let lastHeartRateTime = 0;
    let lastAccelerometerTime = 0;

    // Start heart rate monitor
    const hrSub = heartRateCharacteristic.monitor(async (error, characteristic) => {
      if (error) {
        console.error('❌ Error in HR monitor:', error);
        return;
      }
    
      const now = Date.now();
      if (now - lastHeartRateTime < hrFreqMs) return;
    
      lastHeartRateTime = now;

      if (characteristic?.value) {
        try {
          const currentTime = Date.now();
          const timeSinceLastHR = currentTime - lastHeartRateTime;
          
          if (timeSinceLastHR > 10000) { // If more than 10 seconds since last reading
            console.log(`⚠️ Heart rate data gap detected: ${timeSinceLastHR}ms`);
          }
          
          lastHeartRateTime = currentTime;
          
          const buffer = Buffer.from(characteristic.value, 'base64');
          console.log('📦 Raw heart rate data:', {
            base64: characteristic.value,
            bufferLength: buffer.length,
            buffer: buffer,
            timeSinceLastReading: timeSinceLastHR
          });

          if (buffer.length < 2) {
            console.error('❌ Buffer too short for heart rate data:', buffer.length);
            return;
          }

          const hr = buffer.readUInt8(1);
          console.log('❤️ HR data received:', hr);

          const { error: dbError } = await supabase.from('raw_sensor_data').insert({
            sleep_record_id: sleepRecordId,
            sensor_type: 'heart_rate',
            value: JSON.stringify({ heartRate: hr }),
            captured_at: new Date().toISOString()
          });

          if (dbError) {
            console.error('❌ Failed to insert heart rate data:', dbError.message);
          } else {
            console.log('✅ Heart rate data inserted successfully');
          }
        } catch (e) {
          console.error('❌ Error processing heart rate data:', e);
          console.error('❌ Buffer length:', characteristic.value.length);
          console.error('❌ Base64 value:', characteristic.value);
        }
      }
    });

    // Start accelerometer monitor
    const accelSub = accelerometerCharacteristic.monitor(async (error, characteristic) => {
      if (error) {
        console.error('❌ Error in accel monitor:', error);
        return;
      }
    
      const now = Date.now();
      if (now - lastAccelerometerTime < accelFreqMs) return; 
    
      lastAccelerometerTime = now;

      if (characteristic?.value) {
        try {
          const currentTime = Date.now();
          const timeSinceLastAccel = currentTime - lastAccelerometerTime;
          
          if (timeSinceLastAccel > 10000) { // If more than 10 seconds since last reading
            console.log(`⚠️ Accelerometer data gap detected: ${timeSinceLastAccel}ms`);
          }
          
          lastAccelerometerTime = currentTime;

          const buffer = Buffer.from(characteristic.value, 'base64');
          console.log('📦 Raw accelerometer data:', {
            base64: characteristic.value,
            bufferLength: buffer.length,
            buffer: buffer,
            hex: buffer.toString('hex'),
            timeSinceLastReading: timeSinceLastAccel
          });

          // Check buffer format
          if (buffer.length === 4) {
            // Handle 4-byte format (possibly just x and y)
            const x = buffer.readInt16LE(0);
            const y = buffer.readInt16LE(2);
            console.log('📈 Accel data received (4-byte format):', { x, y });
            
            const { error: dbError } = await supabase.from('raw_sensor_data').insert({
              sleep_record_id: sleepRecordId,
              sensor_type: 'accelerometer',
              value: JSON.stringify({ x, y, z: 0 }), // Set z to 0 for now
              captured_at: new Date().toISOString()
            });

            if (dbError) {
              console.error('❌ Failed to insert accelerometer data:', dbError.message);
            } else {
              console.log('✅ Accelerometer data inserted successfully');
            }
          } else if (buffer.length === 6) {
            // Handle 6-byte format (x, y, z)
            const x = buffer.readInt16LE(0);
            const y = buffer.readInt16LE(2);
            const z = buffer.readInt16LE(4);
            console.log('📈 Accel data received (6-byte format):', { x, y, z });

            const { error: dbError } = await supabase.from('raw_sensor_data').insert({
              sleep_record_id: sleepRecordId,
              sensor_type: 'accelerometer',
              value: JSON.stringify({ x, y, z }),
              captured_at: new Date().toISOString()
            });

            if (dbError) {
              console.error('❌ Failed to insert accelerometer data:', dbError.message);
            } else {
              console.log('✅ Accelerometer data inserted successfully');
            }
          } else {
            console.error('❌ Unexpected accelerometer data format. Length:', buffer.length);
            console.error('❌ Buffer hex:', buffer.toString('hex'));
          }
        } catch (e) {
          console.error('❌ Error processing accelerometer data:', e);
          console.error('❌ Buffer length:', characteristic.value.length);
          console.error('❌ Base64 value:', characteristic.value);
        }
      }
    });

    // Return cleanup function with subscriptions
    if (accelSub && hrSub) {
      onSubscription(accelSub, hrSub);
      return cleanup;
    } else {
      console.error('❌ Failed to create subscriptions');
      return false;
    }
  } catch (error) {
    console.error('💥 Error in startDataCollection:', error);
    return false;
  }
};

export default manager;