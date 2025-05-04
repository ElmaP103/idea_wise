import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import UploadItem from './UploadItem';

export default function UploadManager({
  files,
  showButtonOnly = false,
  showListOnly = false,
}: {
  files: any[];
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
    if (state.status === 'completed' || state.status === 'canceled' || state.status === 'error') {
      setActiveUploads(prev => prev.filter(id => id !== uri));
      startNextUpload();
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

  return (
    <View style={{ width: 340, flex: 1 }}>
      <TouchableOpacity
        style={{
          backgroundColor: '#2f95dc',
          borderRadius: 6,
          paddingVertical: 12,
          alignItems: 'center',
          marginBottom: 12,
          opacity: files.length === 0 || (uploading && activeUploads.length > 0) ? 0.5 : 1,
        }}
        onPress={handleStartAll}
        disabled={files.length === 0 || (uploading && activeUploads.length > 0)}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', letterSpacing: 1 }}>START UPLOAD</Text>
      </TouchableOpacity>
      {files.length > 0 && (
        <View style={{ height: 8, width: '100%', backgroundColor: '#eee', borderRadius: 4, marginBottom: 16 }}>
          <View style={{ height: 8, width: `${overallProgress * 100}%`, backgroundColor: '#2f95dc' }} />
        </View>
      )}
      {files.length === 0 && (
        <Text style={{ color: '#888', textAlign: 'center', marginTop: 16 }}>No files to upload.</Text>
      )}
      {files.length > 0 && (
        <ScrollView style={{ flex: 1, marginTop: 4 }}>
          {files.map(file => (
            <UploadItem
              key={file.uri}
              file={file}
              onStateChange={(state: any) => handleStateChange(file.uri, state)}
              ref={(ref: any) => {
                if (ref) uploadRefs.current[file.uri] = ref;
              }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
