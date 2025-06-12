import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, COMMON_STYLES } from '../constants/theme';
import Icon from 'react-native-vector-icons/Feather';

interface DataModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  data: { time: string; value: string | number }[];
  extraContent?: React.ReactNode;
}

export const DataModal = ({ visible, onClose, title, data, extraContent }: DataModalProps) => {
  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Icon name="x-circle" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {data.length > 0 && (
            <View style={styles.tableContainer}>
              <View style={styles.row}>
                <Text style={styles.headerCell}>Time</Text>
                <Text style={styles.headerCell}>Value</Text>
              </View>
              {data.map((item, index) => (
                <View key={index} style={styles.row}>
                  <Text style={styles.cell}>{item.time}</Text>
                  <Text style={styles.cell}>{item.value}</Text>
                </View>
              ))}
            </View>
          )}

          {extraContent && (
            <View style={styles.extraContentContainer}>
              {extraContent}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.lg,
    backgroundColor: '#F2F2F2',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    fontFamily: 'Roboto',
    color: COLORS.text.primary,
    flex: 1,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  tableContainer: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerCell: {
    flex: 1,
    fontWeight: 'bold',
    fontFamily: 'Roboto',
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  cell: {
    flex: 1,
    fontFamily: 'Roboto',
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  extraContentContainer: {
    backgroundColor: '#fff',
  },
});
