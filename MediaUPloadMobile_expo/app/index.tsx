import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import FilePicker from '../src/components/FilePicker';
import UploadManager from '../src/components/UploadManager';

export default function HomeScreen() {
  const [files, setFiles] = useState<any[]>([]);

  const handleRemoveFile = (uri: string) => {
    setFiles(prev => prev.filter(f => f.uri !== uri));
  };

  return (
    <View style={styles.container}>
      <View style={styles.fixedButtons}>
        <FilePicker onFilesSelected={setFiles} />
        <UploadManager files={files} showButtonOnly onRemoveFile={handleRemoveFile} />
      </View>
      <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 32 }}>
        <UploadManager files={files} showListOnly onRemoveFile={handleRemoveFile} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7',
    padding: 0,
  },
  fixedButtons: {
    backgroundColor: '#f7f7f7',
    paddingTop: 32,
    paddingHorizontal: 16,
    zIndex: 1,
  },
  scrollArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
});
