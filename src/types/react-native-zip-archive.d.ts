declare module 'react-native-zip-archive' {
  export function zip(sourcePath: string, targetPath: string): Promise<string>;
  export function unzip(sourcePath: string, targetPath: string): Promise<string>;
} 