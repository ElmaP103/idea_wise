import React from 'react';
import { View, Image, Text } from 'react-native';
import { DocumentPickerAsset } from 'expo-document-picker';

const FilePreview = ({ file }: { file: DocumentPickerAsset }) => (
  <View style={{ margin: 8, alignItems: 'center' }}>
    {file.mimeType?.startsWith('image') ? (
      <Image source={{ uri: file.uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
    ) : (
      <View style={{ width: 80, height: 80, backgroundColor: '#ccc', borderRadius: 8, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Video</Text>
      </View>
    )}
    <Text numberOfLines={1} style={{ width: 80 }}>{file.name}</Text>
    <Text style={{ fontSize: 10 }}>{(file.size! / 1024).toFixed(1)} KB</Text>
  </View>
);

export default FilePreview;
