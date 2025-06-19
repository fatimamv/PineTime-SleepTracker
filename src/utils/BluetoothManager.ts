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
  log('No PineTime connected – please conectar manualmente');
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
  if (!motion) throw new Error('Motion service no encontrado');
  if (!hr)     throw new Error('Heart-rate service no encontrado');

  const motionChars = await motion.characteristics();
  motionChars.forEach(c => log('motion char', c.uuid, c.isWritableWithResponse, c.isNotifiable));
  const accelChar = motionChars.find(c => c.uuid.toLowerCase() === ACCEL_CHAR_UUID.toLowerCase());
  const accelCtl = motionChars.find(c =>
    c.uuid.toLowerCase() !== ACCEL_CHAR_UUID.toLowerCase() &&
    (c.isWritableWithResponse || c.isWritableWithoutResponse ||
     c.uuid.toLowerCase().endsWith('3003')),
  );
  const hrChar = (await hr.characteristics()).find(
    c => c.uuid.toLowerCase() === HR_CHAR_UUID.toLowerCase(),
  );

  if (!accelChar) throw new Error('Accel char 0x3001 no encontrada');
  if (!hrChar)    throw new Error('HR char 0x2A37 no encontrada');
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
    .insert({ user_id: userId, sleep_date: new Date().toISOString().slice(0, 10) })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
};

/* ------------------------------------------------------------------
 * Accelerometer activation
 * ---------------------------------------------------------------- */
const enableAccelerometer = async (ctl: Characteristic | undefined) => {
  if (!ctl) {
    log('No control characteristic - trying direct monitor');
    return;                                 // salimos – no hace falta comando
  }
  const payload = Buffer.from([0x01]).toString('base64'); // 0x01 = enable
  try {
    // aun cuando isWritable == false, muchos relojes aceptan la escritura
    await ctl.writeWithResponse(payload);
    log('Accelerometer enabled with writeWithResponse');
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'message' in e) {
      log('⚠️ No se pudo escribir (probablemente no necesario):', e.message);
    } else {
      log('⚠️ No se pudo escribir (probablemente no necesario)');
    }
  }
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
  const { device, userId, accelEveryMs, hrEveryMs } = opts;
  log('Starting collection for user', userId);

  const sleepRecordId = await createSleepRecord(userId);
  log('sleepRecordId', sleepRecordId);

  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e: any) {
      console.error(`[BLE‑ERR] ${label}`, { code: e?.errorCode, reason: e?.reason, message: e?.message });
      throw e;           
    }
  };

  const { accelChar, accelCtl, hrChar } = await safe('discoverCharacteristics', () =>
    discoverCharacteristics(device)
  );
  await safe('enableAccelerometer', () => enableAccelerometer(accelCtl));

  // Keep connection alive by reading HR every 30 s
  const keepAlive = setInterval(() => hrChar.read().catch(() => {}), 30000);
  const disconnectSub = device.onDisconnected((e) => log('Device disconnected', e?.message));

  let lastAccel = 0, lastHr = 0;

  // Force periodic accelerometer reading
  const accelInterval = setInterval(async () => {
    try {
      const now = Date.now();
      if (now - lastAccel < accelEveryMs) return;
      
      const characteristic = await accelChar.read();
      if (!characteristic?.value) {
        log('⚠️ No accelerometer value received');
        return;
      }

      lastAccel = now;
      const buf = Buffer.from(characteristic.value, 'base64');
      log('📊 Accelerometer reading:', buf.toString('hex'));

      if (buf.length === 4) {
        const x = buf.readInt8(0);
        const y = buf.readInt8(1);
        const z = buf.readInt8(2);
        const w = buf.readInt8(3);
        await saveSensorData(sleepRecordId, 'accelerometer', { x, y, z, w });
        log('✅ Accelerometer data saved (4 bytes)');
        return;
      }

      if (buf.length === 6) {
        const x = buf.readInt16LE(0);
        const y = buf.readInt16LE(2);
        const z = buf.readInt16LE(4);
        await saveSensorData(sleepRecordId, 'accelerometer', { x, y, z });
        log('✅ Accelerometer data saved (6 bytes)');
        return;
      }

      log('⚠️ Unexpected accelerometer data length:', buf.length);
    } catch (error) {
      log('❌ Error reading accelerometer:', error);
    }
  }, accelEveryMs);

  // Keep monitoring spontaneous data
  const accelSub = accelChar.monitor((err, c) => {
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
    log('📊 Accelerometer monitor reading:', buf.toString('hex'));

    if (buf.length === 4) {
      const x = buf.readInt8(0);
      const y = buf.readInt8(1);
      const z = buf.readInt8(2);
      const w = buf.readInt8(3);
      saveSensorData(sleepRecordId, 'accelerometer', { x, y, z, w })
        .then(() => log('✅ Accelerometer monitor data saved (4 bytes)'))
        .catch(error => log('❌ Error saving accelerometer monitor data:', error));
      return;
    }

    if (buf.length === 6) {
      const x = buf.readInt16LE(0);
      const y = buf.readInt16LE(2);
      const z = buf.readInt16LE(4);
      saveSensorData(sleepRecordId, 'accelerometer', { x, y, z })
        .then(() => log('✅ Accelerometer monitor data saved (6 bytes)'))
        .catch(error => log('❌ Error saving accelerometer monitor data:', error));
      return;
    }

    log('⚠️ Unexpected accelerometer monitor data length:', buf.length);
  });

  const hrSub = hrChar.monitor((err, c) => {
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
    if (buf.length >= 2) {
      const hr = buf.readUInt8(1);
      log('💓 Heart rate received:', hr);
      safe('saveHr', async () => {
        try {
          await saveSensorData(sleepRecordId, 'heart_rate', { heartRate: hr });
          log('✅ Heart rate saved successfully');
        } catch (error) {
          log('❌ Error saving heart rate:', error);
        }
      });
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
  };

  return { subscriptions: { accel: accelSub, hr: hrSub }, cleanup, sleepRecordId };
};
