import React, { createContext, useContext, useState } from 'react';
import { Device } from 'react-native-ble-plx';

interface BluetoothContextType {
  connectedDevice: Device | null;
  setConnectedDevice: (device: Device | null) => void;
}

const BluetoothContext = createContext<BluetoothContextType>({
  connectedDevice: null,
  setConnectedDevice: () => {},
});

export const BluetoothProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  return (
    <BluetoothContext.Provider value={{ connectedDevice, setConnectedDevice }}>
      {children}
    </BluetoothContext.Provider>
  );
};

export const useBluetooth = () => useContext(BluetoothContext);
