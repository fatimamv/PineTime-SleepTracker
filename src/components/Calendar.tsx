import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, FONT_SIZE, SPACING } from '../constants/theme';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface CalendarProps {
  currentDate: Date;
  availableDates: Date[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onMonthChange: (date: Date) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ 
  currentDate, 
  availableDates, 
  selectedDate,
  onDateSelect,
  onMonthChange
}) => {
  // Calculate the start and end of the week that contains the first day of the month
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // 0 = Sunday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 }); // 0 = Sunday
  
  // Get all days for the calendar grid (including days from previous/next month)
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handlePreviousMonth = () => {
    onMonthChange(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    onMonthChange(addMonths(currentDate, 1));
  };

  return (
    <View style={styles.container}>
      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={handlePreviousMonth}>
          <Icon 
            name="chevron-left" 
            size={24} 
            color={COLORS.text.primary}
            style={styles.monthChevron}
          />
        </TouchableOpacity>
        
        <Text style={styles.monthTitle}>
          {format(currentDate, 'MMMM yyyy')}
        </Text>
        
        <TouchableOpacity onPress={handleNextMonth}>
          <Icon 
            name="chevron-right" 
            size={24} 
            color={COLORS.text.primary}
            style={styles.monthChevron}
          />
        </TouchableOpacity>
      </View>
      
      <View style={styles.weekDaysContainer}>
        {weekDays.map(day => (
          <Text key={day} style={styles.weekDay}>
            {day}
          </Text>
        ))}
      </View>
      
      <View style={styles.daysContainer}>
        {days.map((day, index) => {
          const isAvailable = availableDates.some(date => isSameDay(date, day));
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isSelected = isSameDay(day, selectedDate);
          
          return (
            <TouchableOpacity 
              key={index}
              onPress={() => isAvailable && onDateSelect(day)}
              disabled={!isAvailable}
              style={[
                styles.dayCell,
                isAvailable && styles.availableDay,
                isSelected && styles.selectedDay,
                !isCurrentMonth && styles.otherMonthDay
              ]}
            >
              <Text style={[
                styles.dayText,
                isAvailable && styles.availableDayText,
                isSelected && styles.selectedDayText,
                !isCurrentMonth && styles.otherMonthDayText
              ]}>
                {format(day, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: SPACING.sm,
    borderRadius: 8,
    marginTop: SPACING.md,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  monthTitle: {
    fontSize: FONT_SIZE.lg,
    fontFamily: 'Roboto-Regular',
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  monthChevron: {
    padding: SPACING.xs,
  },
  weekDaysContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    paddingHorizontal: 2,
    width: '100%',
  },
  weekDay: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.text.secondary,
    fontFamily: 'Roboto-Regular',
    flex: 1,
    height: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 2,
    width: '100%',
  },
  dayCell: {
    width: '14.28%', // 100% / 7 = 14.28%
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 0,
  },
  dayText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text.primary,
    fontFamily: 'Roboto-Regular',
  },
  availableDay: {
    backgroundColor: COLORS.background.secondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  availableDayText: {
    color: COLORS.text.primary,
  },
  selectedDay: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  selectedDayText: {
    color: COLORS.text.light,
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  otherMonthDayText: {
    color: COLORS.text.secondary,
  },
}); 