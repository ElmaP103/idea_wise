import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';

export default function FilePicker({ onFilesSelected }: { onFilesSelected: (files: any[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [cameraVideo, setCameraVideo] = useState(false);
  const [videoPreview, setVideoPreview] = useState<any | null>(null);

  const requestAllPermissions = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    return lib.status === 'granted' && cam.status === 'granted';
  };

  const pickMedia = async () => {
    setError(null);
    const granted = await requestAllPermissions();
    if (!granted) {
      setError('Permission to access media library and camera is required!');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      if (result.assets.length > 10) {
        setError('You can select up to 10 files.');
        return;
      }
      for (const asset of result.assets) {
        if (!asset.type || (asset.type !== 'image' && asset.type !== 'video')) {
          setError('Only images and videos are allowed.');
          return;
        }
        if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024 * 1024) {
          setError('File too large (max 2GB).');
          return;
        }
      }
      onFilesSelected(result.assets);
    } else {
      setError('No files selected.');
    }
  };

  const takeMedia = async () => {
    setError(null);
    const granted = await requestAllPermissions();
    if (!granted) {
      setError('Permission to access camera is required!');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: cameraVideo ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      if (cameraVideo) {
        // Show custom preview for video
        setVideoPreview(result.assets[0]);
      } else {
        onFilesSelected(result.assets);
      }
    } else {
      setError('No media captured.');
    }
  };

  // Handle confirm/delete/return for video preview
  const handleConfirmVideo = () => {
    if (videoPreview) {
      onFilesSelected([videoPreview]);
      setVideoPreview(null);
    }
  };
  const handleDeleteVideo = () => setVideoPreview(null);
  const handleReturn = () => setVideoPreview(null);

  return (
    <View style={{ width: 340}}>
      <TouchableOpacity style={styles.button} onPress={pickMedia}>
        <Text style={styles.buttonText}>CHOOSE IMAGES OR VIDEOS</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', alignItems: 'center'}}>
        <TouchableOpacity style={[styles.button, styles.fullWidthButton]} onPress={takeMedia}>
          <Text style={styles.buttonText}>
            {cameraVideo ? 'RECORD VIDEO' : 'TAKE PHOTO'}
          </Text>
        </TouchableOpacity>
        <View style={{ marginLeft: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ marginRight: 4 }}>Video</Text>
          <Switch value={cameraVideo} onValueChange={setCameraVideo} />
        </View>
      </View>
      {videoPreview && (
        <View style={styles.previewContainer}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Preview</Text>
          <Video
            source={{ uri: videoPreview.uri }}
            style={{ width: 300, height: 200, backgroundColor: '#000' }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <TouchableOpacity style={[styles.previewButton, { backgroundColor: '#2f95dc' }]} onPress={handleConfirmVideo}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewButton, { backgroundColor: '#e74c3c' }]} onPress={handleDeleteVideo}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.previewButton, { backgroundColor: '#888' }]} onPress={handleReturn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Return</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {error && <Text style={{ color: 'red', marginTop: 8 }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#2f95dc',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  fullWidthButton: {
    flex: 1,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  previewContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  previewButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    minWidth: 80,
    alignItems: 'center',
  },
});
