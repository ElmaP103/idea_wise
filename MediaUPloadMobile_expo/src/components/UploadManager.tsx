import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Dimensions } from 'react-native';
import UploadItem from './UploadItem';
import FilePicker from './FilePicker';

export default function UploadManager({
  files,
  onRemoveFile,
  picking = false,
  showButtonOnly = false,
  showListOnly = false,
}: {
  files: any[];
  onRemoveFile: (uri: string) => void;
  picking?: boolean;
  showButtonOnly?: boolean;
  showListOnly?: boolean;
}) {
  // Track upload state for each file
  const [uploadStates, setUploadStates] = useState<{ [uri: string]: any }>({});
  const [uploading, setUploading] = useState(false);
  const [activeUploads, setActiveUploads] = useState<string[]>([]);

  const uploadRefs = useRef<{ [uri: string]: { start: () => void } }>({});

  const handleStateChange = (uri: string, state: any) => {
    setUploadStates(prev => ({ ...prev, [uri]: state }));
    if (state.status === 'completed' || state.status === 'error') {
      setActiveUploads(prev => prev.filter(id => id !== uri));
      startNextUpload();
    }
    if (state.status === 'canceled') {
      setActiveUploads(prev => prev.filter(id => id !== uri));
      onRemoveFile(uri);
    }
  };

  const startNextUpload = () => {
    const uploadingCount = activeUploads.length;
    if (uploadingCount >= 3) return;
    const toUpload = files.filter(
      f =>
        !uploadStates[f.uri] ||
        (uploadStates[f.uri].status !== 'uploading' &&
          uploadStates[f.uri].status !== 'completed')
    );
    for (let i = 0; i < toUpload.length && activeUploads.length < 3; i++) {
      const file = toUpload[i];
      if (!activeUploads.includes(file.uri)) {
        setActiveUploads(prev => [...prev, file.uri]);
        uploadRefs.current[file.uri]?.start();
      }
    }
  };

  const handleStartAll = () => {
    setUploading(true);
    setActiveUploads([]);
    setTimeout(startNextUpload, 100); // Let state update before starting
  };

  // Calculate overall progress
  const total = files.length;
  const completed = files.filter(f => uploadStates[f.uri]?.status === 'completed').length;
  const overallProgress = total > 0
    ? files.reduce((sum, f) => sum + (uploadStates[f.uri]?.progress || 0), 0) / total
    : 0;

  const isDisabled = files.length === 0 || (uploading && activeUploads.length > 0);

  useEffect(() => {
    // If not uploading, or all files are completed, reset uploading state
    const allCompleted = files.length > 0 && files.every(f => uploadStates[f.uri]?.status === 'completed');
    if ((!uploading && activeUploads.length > 0) || allCompleted) {
      setUploading(false);
      setActiveUploads([]);
    }
    // If new files are added after upload, re-enable the button
    if (!uploading && files.some(f => !uploadStates[f.uri] || uploadStates[f.uri].status !== 'completed')) {
      setUploading(false);
      setActiveUploads([]);
    }
  }, [files, uploadStates]);

  return (
    <View style={{ width: '100%', flex: 1, flexDirection: 'column', position: 'relative', alignItems: 'center' }}>
      {/* Scrollable file list */}
      <View style={{ flex: 1, paddingBottom: 80, width: '100%', alignItems: 'center' }}>
        {/* Overall progress bar */}
        {files.length > 0 && (
          <View style={{ width: 340, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#888' }}>Overall Progress</Text>
              <Text style={{ marginLeft: 'auto', fontWeight: 'bold', fontSize: 14, color: '#888' }}>{(overallProgress * 100).toFixed(1)}%</Text>
            </View>
            <View style={{ height: 8, width: '100%', backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${overallProgress * 100}%`, backgroundColor: '#b39ddb' }} />
            </View>
          </View>
        )}
        {picking && (
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <ActivityIndicator size="large" color="#2f95dc" />
            <Text>Loading files...</Text>
          </View>
        )}
        {files.length > 0 && (
          <ScrollView
            style={{ flex: 1, width: '100%' }}
            contentContainerStyle={{ paddingBottom: 32, alignItems: 'center' }}
            keyboardShouldPersistTaps="handled"
          >
            {files.map(file => (
              <View key={file.uri} style={{ width: 340, alignSelf: 'center' }}>
                <UploadItem
                  file={file} onStateChange={(state: any) => handleStateChange(file.uri, state)}
                  ref={(ref: any) => {
                    if (ref) uploadRefs.current[file.uri] = ref;
                  }}
                />
              </View>
            ))}
          </ScrollView>
        )}
        {files.length === 0 && !picking && (
          <Text style={{ color: '#888', textAlign: 'center', marginTop: 16 }}>
            No files to upload.
          </Text>
        )}
      </View>
      {/* Fixed START UPLOAD button at the bottom */}
      <View style={[styles.fixedButtonContainer, { width: '100%', alignItems: 'center' }]}>
        <TouchableOpacity
          style={{
            backgroundColor: isDisabled ? '#b0b0b0' : '#b39ddb',
            borderRadius: 24,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            width: 340,
            alignSelf: 'center',
            paddingVertical: 14,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 4,
            elevation: 2,
          }}
          onPress={handleStartAll}
          disabled={isDisabled}
        >
          {picking && (
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 10 }} />
          )}
          <Text
            style={{
              color: '#fff',
              fontWeight: 'bold',
              letterSpacing: 1,
              fontSize: 16,
            }}
          >
            START UPLOAD
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fixedButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 0,
    paddingBottom: 8,
    backgroundColor: 'transparent',
    width: '100%',
    alignItems: 'center',
    zIndex: 10,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});

