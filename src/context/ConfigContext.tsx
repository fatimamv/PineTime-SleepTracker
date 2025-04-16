// context/ConfigContext.tsx
import React, { createContext, useContext, useState } from 'react';

type Config = {
  accelFrequency: number; // en milisegundos
  hrFrequency: number;
  setConfig: (config: { accelFrequency?: number; hrFrequency?: number }) => void;
};

const defaultConfig: Config = {
  accelFrequency: 500,
  hrFrequency: 500,
  setConfig: () => {},
};

const ConfigContext = createContext<Config>(defaultConfig);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accelFrequency, setAccelFrequency] = useState(500);
  const [hrFrequency, setHrFrequency] = useState(500);

  const setConfig = ({ accelFrequency, hrFrequency }: { accelFrequency?: number; hrFrequency?: number }) => {
    if (accelFrequency !== undefined) setAccelFrequency(accelFrequency);
    if (hrFrequency !== undefined) setHrFrequency(hrFrequency);
  };

  return (
    <ConfigContext.Provider value={{ accelFrequency, hrFrequency, setConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => useContext(ConfigContext);
