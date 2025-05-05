import React from 'react';
import { View, Text } from 'react-native';

const UploadProgress = ({ progress }: { progress: number[] }) => (
  <View>
    {progress.map((p, i) => (
      <Text key={i}>File {i + 1}: {Math.round(p * 100)}%</Text>
    ))}
  </View>
);

export default UploadProgress;
