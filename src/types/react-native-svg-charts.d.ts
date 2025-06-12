declare module 'react-native-svg-charts' {
  import { ViewStyle } from 'react-native';
  import { SvgProps } from 'react-native-svg';
  import { ReactNode } from 'react';

  interface ChartProps {
    style?: ViewStyle;
    data: number[];
    contentInset?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
    svg?: SvgProps;
    children?: ReactNode;
  }

  interface AxisProps extends ChartProps {
    formatLabel?: (value: number, index?: number) => string;
    numberOfTicks?: number;
    min?: number;
    max?: number;
    stepSize?: number;
    domain?: [number, number];
  }

  export const LineChart: React.FC<ChartProps>;
  export const AreaChart: React.FC<ChartProps>;
  export const YAxis: React.FC<AxisProps>;
  export const XAxis: React.FC<AxisProps>;
} 