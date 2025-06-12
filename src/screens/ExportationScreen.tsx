import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenComponent } from './types';
import styles from './styles';

const ExportationScreen: ScreenComponent = () => {
  return (
    <View style={[styles.container, styles.contentContainer]}>
      <Text style={styles.title}>Exportation</Text>
    </View>
  );
};

export default ExportationScreen; 