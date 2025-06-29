// BluetoothManager.ts – versión depurada completa 🔌
// ------------------------------------------------------------------
//  ▸ Conexión y descubrimiento BLE (ensurePineTime)
//  ▸ Recolección de datos (startCollection)
//  ▸ Inserción en Supabase centralizada (saveSensorData)
//  ▸ Limpieza y keep‑alive integrados
// ------------------------------------------------------------------

import {
  BleManager,
  Device,
  Service,
  Characteristic,
  Subscription,
} from 'react-native-ble-plx';
import { supabase } from '../api/supabaseClient';

/* ------------------------------------------------------------------
 Configuration and utilities
 * ---------------------------------------------------------------- */
export const DEBUG = true; 
const log = (...args: any[]) => DEBUG && console.log('[BLE]', ...args);

const manager = new BleManager();
export default manager;

// UUIDs InfiniTime --------------------------------------------------
const MOTION_SERVICE_UUID = '00030000-78fc-48fe-8e23-433b3a1942d0';
const ACCEL_CHAR_UUID      = '00030001-78fc-48fe-8e23-433b3a1942d0';
const HR_SERVICE_UUID      = '0000180d-0000-1000-8000-00805f9b34fb';
const HR_CHAR_UUID         = '00002a37-0000-1000-8000-00805f9b34fb';

// Connection monitoring
let connectionRetryCount = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY = 5000; // 5 seconds

/* ------------------------------------------------------------------
  * Ensure PineTime connection
 * ---------------------------------------------------------------- */
export const ensurePineTime = async (): Promise<Device | null> => {
  const state = await manager.state();
  if (state !== 'PoweredOn') {
    log('Bluetooth adapter not powered on');
    return null;
  }

  // Check if PineTime is already connected
  const connected = await manager.connectedDevices([]);
  const pineTime = connected.find(d =>
    d.name?.toLowerCase().includes('pinetime') ||
    d.name?.toLowerCase().includes('pine time') ||
    d.name?.toLowerCase().includes('infinitime'),
  );
  if (pineTime) {
    log('PineTime already connected:', pineTime.id);
    return pineTime;
  }
  log('No PineTime connected – please connect your PineTime device manually');
  return null;
};

/* ------------------------------------------------------------------
* Internal helpers
 * ---------------------------------------------------------------- */
const discoverCharacteristics = async (device: Device) => {
  await device.discoverAllServicesAndCharacteristics();

  /* —– DEBUG ————————— */
  const services = await device.services();
  services.forEach(s => {
    log('service', s.uuid);
  });

  /* —– Search services ———————————— */
  const motion = services.find(
    s => s.uuid.toLowerCase() === MOTION_SERVICE_UUID.toLowerCase(),
  );
  const hr = services.find(
    s => s.uuid.toLowerCase() === HR_SERVICE_UUID.toLowerCase(),
  );
  if (!motion) throw new Error('Motion service not encontrado');
  if (!hr)     throw new Error('Heart-rate service no encontrado');

  const motionChars = await motion.characteristics();
  motionChars.forEach(c => log('motion char', c.uuid, c.isWritableWithResponse, c.isNotifiable));
  
  const accelChar = motionChars.find(c => c.uuid.toLowerCase() === ACCEL_CHAR_UUID.toLowerCase());
  
  // Improved control characteristic discovery
  const accelCtl = motionChars.find(c => {
    const uuid = c.uuid.toLowerCase();
    return uuid !== ACCEL_CHAR_UUID.toLowerCase() && 
           (c.isWritableWithResponse || c.isWritableWithoutResponse) &&
           (uuid.endsWith('3002') || uuid.endsWith('3003') || uuid.endsWith('3004'));
  });
  
  const hrChar = (await hr.characteristics()).find(
    c => c.uuid.toLowerCase() === HR_CHAR_UUID.toLowerCase(),
  );

  if (!accelChar) throw new Error('Accel char 0x3001 no encontrada');
  if (!hrChar)    throw new Error('HR char 0x2A37 no encontrada');
  
  log('✅ Found accelerometer control characteristic:', accelCtl?.uuid);
  return { accelChar, accelCtl, hrChar };
};

const saveSensorData = async (
  sleepRecordId: number,
  type: 'accelerometer' | 'heart_rate',
  value: object,
) => {
  try {
    const { data, error } = await supabase.from('raw_sensor_data').insert({
      sleep_record_id: sleepRecordId,
      sensor_type: type,
      value: JSON.stringify(value),
      captured_at: new Date().toISOString(),
    }).select();

    if (error) {
      log('❌ Supabase insert error:', error.message);
      throw error;
    }

    if (!data || data.length === 0) {
      log('⚠️ No data returned after insert');
      throw new Error('No data returned after insert');
    }

    log('✅ Data saved successfully:', { type, value });
    return data;
  } catch (error) {
    log('❌ Error in saveSensorData:', error);
    throw error;
  }
};

const createSleepRecord = async (userId: number) => {
  const { data, error } = await supabase
    .from('sleep_records')
    .insert({
      user_id: userId,
      created_at: new Date().toISOString(),
      sleep_date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD format
    })
    .select()
    .single();

  if (error) {
    log('❌ Error creating sleep record:', error.message);
    throw error;
  }

  return data.id;
};

/* ------------------------------------------------------------------
 * Accelerometer activation with improved configuration
 * ---------------------------------------------------------------- */
const enableAccelerometer = async (ctl: Characteristic | undefined) => {
  if (!ctl) {
    log('⚠️ No control characteristic found - trying direct monitor');
    return;                                
  }
  
  log('🔧 Attempting to enable accelerometer...');
  
  // First, try to reset/disable the accelerometer
  try {
    log('🔄 Resetting accelerometer first...');
    await ctl.writeWithResponse(Buffer.from([0x00]).toString('base64')); // Disable
    await new Promise(resolve => setTimeout(resolve, 1000));
    log('✅ Accelerometer reset complete');
  } catch (error) {
    log('⚠️ Could not reset accelerometer:', error);
  }
  
  // More comprehensive activation commands for better sensor configuration
  const commands = [
    0x01, // Basic enable
    0x02, // Enable notifications
    0x03, // Start sampling
    0x04, // Continuous mode
    0x05, // High frequency mode
    0x10, // Start sampling
    0x20, // Enable notifications
    0x30, // Enable all sensors
    0x40, // High resolution mode
    0x50, // Low power mode
    0x60, // Normal mode
    0x70, // Fast mode
    0x80, // Ultra fast mode
    0x90, // Power save mode
    0xA0, // Active mode
    0xB0, // Wake up mode
    0xC0, // Sleep mode
    0xD0, // Standby mode
    0xE0, // Measurement mode
    0xF0, // Idle mode
    // Try some multi-byte commands
    0x0102, // Enable + notifications
    0x0203, // Notifications + sampling
    0x0304, // Sampling + continuous
    0x0405, // Continuous + high frequency
    0x1020, // Start sampling + notifications
    0x2030, // Notifications + all sensors
    0x3040, // All sensors + high resolution
    0x4050, // High resolution + low power
    0x5060, // Low power + normal
    0x6070, // Normal + fast
    0x7080, // Fast + ultra fast
    0x8090, // Ultra fast + power save
    0x90A0, // Power save + active
    0xA0B0, // Active + wake up
    0xB0C0, // Wake up + sleep
    0xC0D0, // Sleep + standby
    0xD0E0, // Standby + measurement
    0xE0F0  // Measurement + idle
  ];
  
  let success = false;
  for (const cmd of commands) {
    try {
      log(`🔧 Trying accelerometer command: 0x${cmd.toString(16).padStart(2, '0')}`);
      
      let payload: Buffer;
      if (cmd > 0xFF) {
        // Multi-byte command
        payload = Buffer.from([cmd & 0xFF, (cmd >> 8) & 0xFF]);
      } else {
        // Single byte command
        payload = Buffer.from([cmd]);
      }
      
      // Try writeWithResponse first
      try {
        await ctl.writeWithResponse(payload.toString('base64'));
        log(`✅ Command 0x${cmd.toString(16).padStart(2, '0')} writeWithResponse successful`);
        success = true;
        // Wait a bit after successful command
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (writeError) {
        log(`⚠️ Command 0x${cmd.toString(16).padStart(2, '0')} writeWithResponse failed:`, writeError);
      }
      
      // Try writeWithoutResponse as fallback
      try {
        await ctl.writeWithoutResponse(payload.toString('base64'));
        log(`✅ Command 0x${cmd.toString(16).padStart(2, '0')} writeWithoutResponse successful`);
        success = true;
        // Wait a bit after successful command
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (writeError) {
        log(`⚠️ Command 0x${cmd.toString(16).padStart(2, '0')} writeWithoutResponse failed:`, writeError);
      }
    } catch (error) {
      log(`❌ Error with command 0x${cmd.toString(16).padStart(2, '0')}:`, error);
    }
  }

  if (!success) {
    log('⚠️ No accelerometer commands succeeded, trying default configuration');
    // Try a basic configuration as fallback
    try {
      await ctl.writeWithResponse(Buffer.from([0x01, 0x02, 0x03]).toString('base64'));
      log('✅ Basic accelerometer configuration applied');
    } catch (error) {
      log('❌ Basic accelerometer configuration failed:', error);
    }
  }

  // Wait for accelerometer to initialize
  await new Promise(resolve => setTimeout(resolve, 3000));
  log('⏰ Accelerometer initialization complete');
};

/* ------------------------------------------------------------------
 * Improved data parsing for accelerometer
 * ---------------------------------------------------------------- */
const parseAccelerometerData = (buf: Buffer) => {
  log('📊 Raw accelerometer data:', buf.toString('hex'), 'length:', buf.length);
      
      // Log individual bytes for debugging
      const bytes = Array.from(buf).map(b => b.toString(16).padStart(2, '0'));
      log('📊 Individual bytes:', bytes.join(' '));

      if (buf.length === 4) {
        // Try different parsing methods for 4-byte data
        const x1 = buf.readInt8(0);
        const y1 = buf.readInt8(1);
        const z1 = buf.readInt8(2);
        const w1 = buf.readInt8(3);
        
        // Alternative: try unsigned values
        const x2 = buf.readUInt8(0);
        const y2 = buf.readUInt8(1);
        const z2 = buf.readUInt8(2);
        const w2 = buf.readUInt8(3);
        
        // Alternative: try 16-bit values (first 2 bytes)
        const x3 = buf.readInt16LE(0);
        const y3 = buf.readInt16LE(2);
        
        log('📊 Parsing attempts for 4-byte data:');
        log('  Method 1 (signed 8-bit):', { x: x1, y: y1, z: z1, w: w1 });
        log('  Method 2 (unsigned 8-bit):', { x: x2, y: y2, z: z2, w: w2 });
        log('  Method 3 (16-bit LE):', { x: x3, y: y3 });
        
    // Check if data looks valid (not all zeros or constant values)
    const isConstantData = (x1 === 70 && y1 === 1 && z1 === 0 && w1 === 0) ||
                          (x1 === -50 && y1 === 0 && z1 === 0 && w1 === 0) ||
                          (x1 === 0 && y1 === 0 && z1 === 0 && w1 === 0);
    
    if (isConstantData) {
      log('⚠️ Suspicious constant accelerometer data detected');
      // Try alternative parsing methods - use 16-bit values as primary
      return {
        x: x3, y: y3, z: 0, w: 0, // Use 16-bit values as primary
        x_alt1: x1, y_alt1: y1, z_alt1: z1, w_alt1: w1,
        x_alt2: x2, y_alt2: y2, z_alt2: z2, w_alt2: w2,
        raw_hex: buf.toString('hex'),
        parsing_method: 'alternative_16bit',
        is_constant: true,
        original_values: { x: x1, y: y1, z: z1, w: w1 }
      };
    }
    
    return { 
          x: x1, y: y1, z: z1, w: w1,
          x_alt1: x2, y_alt1: y2, z_alt1: z2, w_alt1: w2,
      x_alt2: x3, y_alt2: y3,
      raw_hex: buf.toString('hex'),
      parsing_method: 'primary'
    };
      }

      if (buf.length === 6) {
        const x = buf.readInt16LE(0);
        const y = buf.readInt16LE(2);
        const z = buf.readInt16LE(4);
    
    const isValidData = !(x === 0 && y === 0 && z === 0);
    
    return { 
      x, y, z, 
      raw_hex: buf.toString('hex'),
      parsing_method: '16bit',
      is_valid: isValidData
    };
  }

  log('⚠️ Unexpected accelerometer data length:', buf.length);
  return { 
    raw_hex: buf.toString('hex'),
    parsing_method: 'unknown',
    is_valid: false
  };
};

/* ------------------------------------------------------------------
 * Connection recovery mechanism with device rediscovery
 * ---------------------------------------------------------------- */
const attemptReconnection = async (
  originalDevice: Device, 
  sleepRecordId: number, 
  onReconnect: () => void,
  onReconnectSuccess?: (device: Device, accelChar: Characteristic, hrChar: Characteristic) => void
) => {
  if (connectionRetryCount >= MAX_RETRY_ATTEMPTS) {
    log('❌ Max reconnection attempts reached');
    return false;
  }

  connectionRetryCount++;
  log(`🔄 Attempting reconnection ${connectionRetryCount}/${MAX_RETRY_ATTEMPTS}`);

  try {
    // Wait before attempting reconnection
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    
    // First, try to find the PineTime device again
    log('🔍 Rediscovering PineTime device...');
    const rediscoveredDevice = await ensurePineTime();
    
    if (!rediscoveredDevice) {
      log('❌ PineTime device not found during reconnection');
      return false;
    }

    log('✅ PineTime device found:', rediscoveredDevice.name);
    
    // Check if it's the same device or a different one
    if (rediscoveredDevice.id !== originalDevice.id) {
      log('⚠️ Different PineTime device found, using new device');
    }

    // Try to reconnect to the device
    const reconnected = await rediscoveredDevice.connect();
    if (reconnected) {
      log('✅ Reconnection successful');
      connectionRetryCount = 0; // Reset counter on success
      
      // Rediscover services and characteristics
      log('🔍 Rediscovering services and characteristics...');
      const { accelChar, accelCtl, hrChar } = await discoverCharacteristics(rediscoveredDevice);
      
      // Re-enable accelerometer
      await enableAccelerometer(accelCtl);
      
      log('✅ Services and characteristics rediscovered');
      
      // Call the success callback with the new device and characteristics
      if (onReconnectSuccess) {
        onReconnectSuccess(rediscoveredDevice, accelChar, hrChar);
      }
      
      onReconnect();
      return true;
    } else {
      log('❌ Failed to connect to rediscovered device');
    }
  } catch (error) {
    log('❌ Reconnection attempt failed:', error);
  }

  return false;
};

/* ------------------------------------------------------------------
 *  Connect, creates sleepRecord, subscribes and returns cleanup
 * ---------------------------------------------------------------- */
export const startCollection = async (opts: {
  device: Device;
  userId: number;
  accelEveryMs: number;
  hrEveryMs: number;
}): Promise<{ subscriptions: { accel: Subscription; hr: Subscription }; cleanup: () => void; sleepRecordId: number }> => {
  const { device: initialDevice, userId, accelEveryMs, hrEveryMs } = opts;
  log('Starting collection for user', userId, 'with frequencies:', { accelEveryMs, hrEveryMs });

  const sleepRecordId = await createSleepRecord(userId);
  log('sleepRecordId', sleepRecordId);

  // Track current device and characteristics
  let currentDevice = initialDevice;
  let currentAccelChar!: Characteristic; // Using definite assignment assertion
  let currentHrChar!: Characteristic;    // Using definite assignment assertion
  let currentAccelCtl: Characteristic | undefined;

  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e: any) {
      console.error(`[BLE‑ERR] ${label}`, { code: e?.errorCode, reason: e?.reason, message: e?.message });
      throw e;           
    }
  };

  // Initialize characteristics
  const initializeCharacteristics = async (device: Device) => {
    const { accelChar, accelCtl, hrChar } = await safe('discoverCharacteristics', () =>
      discoverCharacteristics(device)
    );
    currentAccelChar = accelChar;
    currentHrChar = hrChar;
    currentAccelCtl = accelCtl;
    await safe('enableAccelerometer', () => enableAccelerometer(accelCtl));
  };

  // Initialize with the initial device
  await initializeCharacteristics(currentDevice);

  // Enhanced keep-alive mechanism
  const keepAlive = setInterval(async () => {
    try {
      await currentHrChar.read();
      log('💓 Keep-alive HR read successful');
    } catch (error) {
      log('⚠️ Keep-alive failed, attempting reconnection...');
      await attemptReconnection(
        currentDevice, 
        sleepRecordId, 
        () => {
          log('🔄 Reconnection successful, resuming data collection');
        },
        (newDevice, newAccelChar, newHrChar) => {
          // Update current references
          currentDevice = newDevice;
          currentAccelChar = newAccelChar;
          currentHrChar = newHrChar;
          log('✅ Device references updated after reconnection');
        }
      );
    }
  }, 15000); // Reduced to 15 seconds for better connection stability

  // Manual heart rate reading to ensure we get data
  const manualHrInterval = setInterval(async () => {
    try {
      const now = Date.now();
      if (now - lastHr < hrEveryMs) return;
      
      const characteristic = await currentHrChar.read();
      if (!characteristic?.value) {
        log('⚠️ No manual heart rate value received');
        return;
      }

      lastHr = now;
      const buf = Buffer.from(characteristic.value, 'base64');
      log('💓 Manual heart rate raw data:', buf.toString('hex'), 'length:', buf.length);
      
      // Try different heart rate parsing methods
      let hr: number | null = null;
      if (buf.length >= 2) {
        // Standard heart rate format: flags in byte 0, HR in byte 1
        const flags = buf.readUInt8(0);
        hr = buf.readUInt8(1);
        
        // Check if HR is in a different position based on flags
        if (flags & 0x01) {
          // HR is 16-bit
          if (buf.length >= 3) {
            hr = buf.readUInt16LE(1);
          }
        }
        
        log('💓 Manual heart rate parsed:', hr, 'flags:', flags);
        
        if (hr && hr > 0 && hr < 250) { // Valid HR range
          try {
            await saveSensorData(sleepRecordId, 'heart_rate', { 
              heartRate: hr,
              raw_hex: buf.toString('hex'),
              flags: flags,
              timestamp: new Date().toISOString(),
              source: 'manual_read'
            });
            log('✅ Manual heart rate saved successfully:', hr);
          } catch (error) {
            log('❌ Error saving manual heart rate:', error);
          }
        } else {
          log('⚠️ Invalid manual heart rate value:', hr);
        }
      } else {
        log('⚠️ Invalid manual heart rate data length:', buf.length);
      }
    } catch (error) {
      log('❌ Error reading manual heart rate:', error);
    }
  }, hrEveryMs);

  const disconnectSub = currentDevice.onDisconnected(async (e) => {
    log('❌ Device disconnected:', e?.message);
    await attemptReconnection(
      currentDevice, 
      sleepRecordId, 
      () => {
        log('🔄 Reconnection successful after disconnect');
      },
      (newDevice, newAccelChar, newHrChar) => {
        // Update current references
        currentDevice = newDevice;
        currentAccelChar = newAccelChar;
        currentHrChar = newHrChar;
        log('✅ Device references updated after disconnect reconnection');
      }
    );
  });

  let lastAccel = 0, lastHr = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;
  
  // Track accelerometer data for stale detection and movement detection
  let lastAccelData = '';
  let staleDataCount = 0;
  const MAX_STALE_DATA = 5;
  
  // Movement detection variables
  let lastAccelValues = { x: 0, y: 0, z: 0, w: 0 };
  let movementThreshold = 2; // Reduced from 5 to 2 for more sensitive movement detection
  let movementHistory: Array<{timestamp: number, movement: string, magnitude: number}> = [];
  const MAX_MOVEMENT_HISTORY = 100;

  // Function to detect movement between readings
  const detectMovement = (currentValues: { x: number, y: number, z: number, w: number }) => {
    const deltaX = Math.abs(currentValues.x - lastAccelValues.x);
    const deltaY = Math.abs(currentValues.y - lastAccelValues.y);
    const deltaZ = Math.abs(currentValues.z - lastAccelValues.z);
    const deltaW = Math.abs(currentValues.w - lastAccelValues.w);
    
    const totalDelta = deltaX + deltaY + deltaZ + deltaW;
    const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ + deltaW * deltaW);
    
    let movementType = 'none';
    if (totalDelta > movementThreshold) {
      if (deltaX > deltaY && deltaX > deltaZ) {
        movementType = 'roll'; // X-axis change (rolling wrist)
      } else if (deltaY > deltaX && deltaY > deltaZ) {
        movementType = 'pitch'; // Y-axis change (tilting wrist)
      } else if (deltaZ > deltaX && deltaZ > deltaY) {
        movementType = 'yaw'; // Z-axis change (turning wrist)
      } else {
        movementType = 'general'; // General movement
      }
      
      // Add to movement history
      const movementEvent = {
        timestamp: Date.now(),
        movement: movementType,
        magnitude: magnitude
      };
      
      movementHistory.push(movementEvent);
      if (movementHistory.length > MAX_MOVEMENT_HISTORY) {
        movementHistory.shift(); // Remove oldest entry
      }
      
      log(`🏃 Movement detected: ${movementType} (magnitude: ${magnitude.toFixed(2)}, delta: ${totalDelta.toFixed(2)})`);
      return { detected: true, type: movementType, magnitude, delta: totalDelta };
    }
    
    return { detected: false, type: 'none', magnitude: 0, delta: totalDelta };
  };

  // Function to get movement summary
  const getMovementSummary = () => {
    const now = Date.now();
    const last5Minutes = now - (5 * 60 * 1000);
    const recentMovements = movementHistory.filter(m => m.timestamp > last5Minutes);
    
    return {
      total_movements: recentMovements.length,
      movement_types: recentMovements.reduce((acc, m) => {
        acc[m.movement] = (acc[m.movement] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      average_magnitude: recentMovements.length > 0 
        ? recentMovements.reduce((sum, m) => sum + m.magnitude, 0) / recentMovements.length 
        : 0,
      last_movement: recentMovements.length > 0 ? recentMovements[recentMovements.length - 1] : null
    };
  };

  // Alternative accelerometer reading method for when stale data is detected
  const forceAccelerometerRead = async () => {
    try {
      log('🔄 Forcing alternative accelerometer read...');
      
      // Try reading multiple times with delays
      for (let i = 0; i < 3; i++) {
        try {
          await new Promise(resolve => setTimeout(resolve, 200 * (i + 1))); // Increasing delays
          const characteristic = await currentAccelChar.read();
          if (characteristic?.value) {
            const buf = Buffer.from(characteristic.value, 'base64');
            const rawData = buf.toString('hex');
            
            if (rawData !== lastAccelData) {
              log('✅ Alternative read got new data:', rawData);
              lastAccelData = rawData;
              staleDataCount = 0;
              
              const parsedData = parseAccelerometerData(buf);
              await saveSensorData(sleepRecordId, 'accelerometer', parsedData);
              log('✅ Alternative accelerometer data saved');
              return true;
            }
          }
        } catch (error) {
          log('⚠️ Alternative read attempt failed:', error);
        }
      }
      
      log('❌ All alternative read attempts failed or returned stale data');
      return false;
    } catch (error) {
      log('❌ Error in forceAccelerometerRead:', error);
      return false;
    }
  };

  // Force periodic accelerometer reading with error recovery
  const accelInterval = setInterval(async () => {
    try {
      const now = Date.now();
      if (now - lastAccel < accelEveryMs) return;
      
      const characteristic = await currentAccelChar.read();
      if (!characteristic?.value) {
        log('⚠️ No accelerometer value received');
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log('❌ Too many consecutive errors, attempting reconnection');
          await attemptReconnection(
            currentDevice, 
            sleepRecordId, 
            () => {
              consecutiveErrors = 0;
            },
            (newDevice, newAccelChar, newHrChar) => {
              currentDevice = newDevice;
              currentAccelChar = newAccelChar;
              currentHrChar = newHrChar;
              consecutiveErrors = 0;
            }
          );
        }
        return;
      }

      consecutiveErrors = 0; // Reset error counter on success
      lastAccel = now;
      const buf = Buffer.from(characteristic.value, 'base64');
      const rawData = buf.toString('hex');
      
      // Check for stale data
      if (rawData === lastAccelData) {
        staleDataCount++;
        log(`⚠️ Stale accelerometer data detected (${staleDataCount}/${MAX_STALE_DATA}): ${rawData}`);
        
        if (staleDataCount >= MAX_STALE_DATA) {
          log('🔄 Too much stale data, forcing accelerometer reconfiguration...');
          try {
            // Try to force a new reading by re-enabling the accelerometer
            if (currentAccelCtl) {
              await currentAccelCtl.writeWithResponse(Buffer.from([0x01]).toString('base64'));
              await new Promise(resolve => setTimeout(resolve, 1000));
              log('✅ Accelerometer reconfiguration attempted');
            }
            
            // Try alternative reading method
            const alternativeSuccess = await forceAccelerometerRead();
            if (!alternativeSuccess) {
              log('⚠️ Alternative reading also failed, will try again next cycle');
            }
            
            staleDataCount = 0; // Reset counter
          } catch (error) {
            log('❌ Error reconfiguring accelerometer:', error);
          }
        }
      } else {
        staleDataCount = 0; // Reset counter on new data
        lastAccelData = rawData;
      }
      
      const parsedData = parseAccelerometerData(buf);
      
      // Detect movement between readings
      const currentValues = { 
        x: parsedData.x || 0, 
        y: parsedData.y || 0, 
        z: parsedData.z || 0, 
        w: parsedData.w || 0 
      };
      
      const movementResult = detectMovement(currentValues);
      
      // Save both the raw accelerometer data and movement detection
      const enhancedData = {
        ...parsedData,
        movement_detected: movementResult.detected,
        movement_type: movementResult.type,
        movement_magnitude: movementResult.magnitude,
        movement_delta: movementResult.delta,
        movement_summary: getMovementSummary(),
        timestamp: new Date().toISOString()
      };
      
      await saveSensorData(sleepRecordId, 'accelerometer', enhancedData);
      
      // Update last values for next comparison
      lastAccelValues = currentValues;
      
      if (movementResult.detected) {
        log(`🏃 Movement saved: ${movementResult.type} (magnitude: ${movementResult.magnitude.toFixed(2)})`);
      } else {
        log('✅ Accelerometer data saved (no movement detected)');
      }
      
    } catch (error) {
      log('❌ Error reading accelerometer:', error);
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log('❌ Too many consecutive errors, attempting reconnection');
        await attemptReconnection(
          currentDevice, 
          sleepRecordId, 
          () => {
            consecutiveErrors = 0;
          },
          (newDevice, newAccelChar, newHrChar) => {
            currentDevice = newDevice;
            currentAccelChar = newAccelChar;
            currentHrChar = newHrChar;
            consecutiveErrors = 0;
          }
        );
      }
    }
  }, Math.min(accelEveryMs, 500)); // More frequent readings, max 500ms to catch movement events

  // Keep monitoring spontaneous data
  const accelSub = currentAccelChar.monitor((err, c) => {
    if (err) {
      log('❌ Accelerometer monitoring error:', err.message);
      return;
    }
    if (!c?.value) {
      log('⚠️ No accelerometer value in monitor');
      return;
    }
    const now = Date.now();
    if (now - lastAccel < accelEveryMs) {
      log('⏱️ Skipping accelerometer - too soon');
      return;
    }
    lastAccel = now;
    const buf = Buffer.from(c.value, 'base64');
    const rawData = buf.toString('hex');
    
    // Check for stale data in monitor as well
    if (rawData === lastAccelData) {
      staleDataCount++;
      log(`⚠️ Stale accelerometer data in monitor (${staleDataCount}/${MAX_STALE_DATA}): ${rawData}`);
      
      if (staleDataCount >= MAX_STALE_DATA) {
        log('🔄 Too much stale data in monitor, forcing accelerometer reconfiguration...');
        // Force reconfiguration in the next interval
        setTimeout(async () => {
          try {
            if (currentAccelCtl) {
              await currentAccelCtl.writeWithResponse(Buffer.from([0x01]).toString('base64'));
              await new Promise(resolve => setTimeout(resolve, 1000));
              log('✅ Accelerometer reconfiguration from monitor attempted');
            }
            staleDataCount = 0; // Reset counter
          } catch (error) {
            log('❌ Error reconfiguring accelerometer from monitor:', error);
          }
        }, 100);
      }
    } else {
      staleDataCount = 0; // Reset counter on new data
      lastAccelData = rawData;
    }
    
    const parsedData = parseAccelerometerData(buf);
    
    // Detect movement between readings in monitor as well
    const currentValues = { 
      x: parsedData.x || 0, 
      y: parsedData.y || 0, 
      z: parsedData.z || 0, 
      w: parsedData.w || 0 
    };
    
    const movementResult = detectMovement(currentValues);
    
    // Save enhanced data with movement information
    const enhancedData = {
      ...parsedData,
      movement_detected: movementResult.detected,
      movement_type: movementResult.type,
      movement_magnitude: movementResult.magnitude,
      movement_delta: movementResult.delta,
      movement_summary: getMovementSummary(),
      timestamp: new Date().toISOString(),
      source: 'monitor'
    };
    
    saveSensorData(sleepRecordId, 'accelerometer', enhancedData)
      .then(() => {
        if (movementResult.detected) {
          log(`🏃 Monitor movement saved: ${movementResult.type} (magnitude: ${movementResult.magnitude.toFixed(2)})`);
        } else {
          log('✅ Accelerometer monitor data saved (no movement detected)');
        }
      })
        .catch(error => log('❌ Error saving accelerometer monitor data:', error));

    // Update last values for next comparison
    lastAccelValues = currentValues;
  });

  const hrSub = currentHrChar.monitor((err, c) => {
    if (err) {
      log('❌ Heart rate monitoring error:', err.message);
      return;
    }
    if (!c?.value) {
      log('⚠️ No heart rate value received');
      return;
    }
    const now = Date.now();
    if (now - lastHr < hrEveryMs) {
      log('⏱️ Skipping heart rate - too soon');
      return;
    }
    lastHr = now;
    const buf = Buffer.from(c.value, 'base64');
    log('💓 Heart rate raw data:', buf.toString('hex'), 'length:', buf.length);
    
    // Try different heart rate parsing methods
    let hr: number | null = null;
    if (buf.length >= 2) {
      // Standard heart rate format: flags in byte 0, HR in byte 1
      const flags = buf.readUInt8(0);
      hr = buf.readUInt8(1);
      
      // Check if HR is in a different position based on flags
      if (flags & 0x01) {
        // HR is 16-bit
        if (buf.length >= 3) {
          hr = buf.readUInt16LE(1);
        }
      }
      
      log('💓 Heart rate parsed:', hr, 'flags:', flags);
      
      if (hr && hr > 0 && hr < 250) { // Valid HR range
      safe('saveHr', async () => {
        try {
            await saveSensorData(sleepRecordId, 'heart_rate', { 
              heartRate: hr,
              raw_hex: buf.toString('hex'),
              flags: flags,
              timestamp: new Date().toISOString()
            });
            log('✅ Heart rate saved successfully:', hr);
        } catch (error) {
          log('❌ Error saving heart rate:', error);
        }
      });
      } else {
        log('⚠️ Invalid heart rate value:', hr);
      }
    } else {
      log('⚠️ Invalid heart rate data length:', buf.length);
    }
  });

  const cleanup = () => {
    log('Cleaning up collection');
    accelSub.remove();
    hrSub.remove();
    disconnectSub.remove();
    clearInterval(keepAlive);
    clearInterval(accelInterval);
    clearInterval(manualHrInterval);
    connectionRetryCount = 0; // Reset retry counter
  };

  return { subscriptions: { accel: accelSub, hr: hrSub }, cleanup, sleepRecordId };
};
