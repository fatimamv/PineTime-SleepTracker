import 'react-native-url-polyfill/auto';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import StatisticsScreen from './src/screens/StatisticsScreen';
import ExportationScreen from './src/screens/ExportationScreen';
import ConfigurationScreen from './src/screens/ConfigurationScreen';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { BluetoothProvider } from './src/context/BluetoothContext';
import { Buffer } from 'buffer';
global.Buffer = global.Buffer || Buffer;
import { ConfigProvider } from './src/context/ConfigContext';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <ConfigProvider>
      <BluetoothProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
            tabBarActiveTintColor: '#007AFF',
            tabBarInactiveTintColor: '#8E8E93',
            tabBarStyle: {
              backgroundColor: '#fff',
              borderTopWidth: 1,
              borderTopColor: '#E5E5EA',
            },
            headerShown: false,
            }}
          >
            <Tab.Screen 
              name="Home" 
              component={HomeScreen}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Icon name="home-outline" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen 
              name="Statistics" 
              component={StatisticsScreen}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Icon name="chart-line" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen 
              name="Exportation" 
              component={ExportationScreen}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Icon name="export" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen 
              name="Configuration" 
              component={ConfigurationScreen}
              options={{
                tabBarIcon: ({ color, size }) => (
                  <Icon name="cog-outline" size={size} color={color} />
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </BluetoothProvider>
    </ConfigProvider>
  );
}
