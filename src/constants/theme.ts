import { ViewStyle, TextStyle, ImageStyle } from 'react-native';

export const COLORS = {
  primary: '#4CBAE6',
  secondary: '#f0f0f0',
  text: {
    primary: '#000000',
    secondary: '#666666',
    light: '#ffffff',
  },
  border: '#e0e0e0',
  background: {
    primary: '#ffffff',
    secondary: '#f0f0f0',
    input: '#f2f2f2',
  }
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const FONT_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
};

export const FONT_FAMILY = {
  regular: 'Roboto-Regular',
  bold: 'Roboto-Bold',
  italic: 'Roboto-Italic',
  boldItalic: 'Roboto-BoldItalic',
};

export const BORDER_RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 4,
  },
};

export const COMMON_STYLES = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
  } as ViewStyle,
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  } as ViewStyle,
  center: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  } as ViewStyle,
  card: {
    backgroundColor: COLORS.background.primary,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  } as ViewStyle,
  button: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primary,
  } as ViewStyle,
  buttonText: {
    color: COLORS.text.light,
    fontWeight: 'bold' as const,
  } as TextStyle,
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  } as ViewStyle,
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold' as const,
    color: COLORS.text.primary,
  } as TextStyle,
  subtitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold' as const,
    color: COLORS.text.primary,
  } as TextStyle,
  text: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text.primary,
  } as TextStyle,
  textSecondary: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text.secondary,
  } as TextStyle,
}; 