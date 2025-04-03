import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import StatisticsScreen from './src/screens/StatisticsScreen';
import ExportationScreen from './src/screens/ExportationScreen';
import ConfigurationScreen from './src/screens/ConfigurationScreen';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
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
          headerStyle: {
            backgroundColor: '#fff',
          },
          headerTintColor: '#000',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
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
  );
}
