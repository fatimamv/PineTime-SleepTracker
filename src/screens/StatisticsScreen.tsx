import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenComponent } from './types';

const StatisticsScreen: ScreenComponent = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Statistics</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});

export default StatisticsScreen;