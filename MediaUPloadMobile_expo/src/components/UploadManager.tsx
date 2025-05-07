import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import UploadItem from './UploadItem';
import FilePicker from './FilePicker';

export default function UploadManager({
  files,
  onRemoveFile,
  showButtonOnly = false,
  showListOnly = false,
}: {
  files: any[];
  onRemoveFile: (uri: string) => void;
  showButtonOnly?: boolean;
  showListOnly?: boolean;
}) {
  // Track upload state for each file
  const [uploadStates, setUploadStates] = useState<{ [uri: string]: any }>({});
  const [uploading, setUploading] = useState(false);
  const [activeUploads, setActiveUploads] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

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
  const overallProgress = total > 0 ? completed / total : 0;

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
    <View style={{ width: 340, flex: 1, flexDirection: 'column' }}>
      {/* Button section - separate wrapper */}
      <View style={{ zIndex: 2 }}>
        <TouchableOpacity
          style={{
            backgroundColor: isDisabled ? '#b0b0b0' : '#2f95dc',
            borderRadius: 6,
            // paddingVertical: 12,
            alignItems: 'center',
            marginBottom: 16,
          }}
          onPress={handleStartAll}
          disabled={isDisabled}
        >
          <Text
            style={{
              color: '#fff',
              fontWeight: 'bold',
              letterSpacing: 1,
            }}
          >
            START UPLOAD
          </Text>
        </TouchableOpacity>

        {files.length === 0 && (
          <Text style={{ color: '#888', textAlign: 'center', marginTop: 16 }}>
            No files to upload.
          </Text>
        )}
      </View>

      {/* ScrollView section - completely separate from button section */}
      <View style={{ flex: 1 }}>
        {picking && (
          <View style={{ alignItems: 'center', marginVertical: 16 }}>
            <ActivityIndicator size="large" color="#2f95dc" />
            <Text>Loading files...</Text>
          </View>
        )}
        {files.length > 0 && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {files.map(file => (
              <UploadItem
                key={file.uri}
                file={file} onStateChange={(state: any) => handleStateChange(file.uri, state)}
                ref={(ref: any) => {
                  if (ref) uploadRefs.current[file.uri] = ref;
                }}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

