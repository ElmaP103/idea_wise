import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Image, Modal, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

export default function FilePicker({ onFilesSelected }: { onFilesSelected: (files: any[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [cameraVideo, setCameraVideo] = useState(false);
  const [videoPreview, setVideoPreview] = useState<any | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const [uploading, setUploading] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

  const requestAllPermissions = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const cam = await requestCameraPermission();
    const mic = await requestMicrophonePermission();
    return lib.status === 'granted' && cam.status === 'granted' && mic.status === 'granted';
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
      onFilesSelected(result.assets.map(asset => ({ ...asset, status: 'pending', uploadedAt: Date.now() })));
    } else {
      setError('No files selected.');
    }
  };

  const startRecording = async () => {
    if (cameraRef.current) {
      try {
        setIsRecording(true);
        const video = await cameraRef.current?.recordAsync({
          maxDuration: 300,
        });
        if (!video) {
          setError('Failed to record video.');
          return;
        }
        setVideoPreview({
          uri: video.uri,
          type: 'video'
        });
        setShowPreview(true);
      } catch (error) {
        console.error('Error recording video:', error);
        setError('Failed to record video. Please try again.');
      } finally {
        setIsRecording(false);
        setShowCamera(false);
      }
    }
  };

  const stopRecording = async () => {
    console.log('stopped--')
    if (cameraRef.current && isRecording) {
      await cameraRef.current.stopRecording();
    }
  };

  const takeMedia = async () => {
    setError(null);
    const granted = await requestAllPermissions();
    if (!granted) {
      setError('Permission to access camera is required!');
      return;
    }

    if (cameraVideo) {
      setShowCamera(true);
    } else {
      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1,
          allowsEditing: true,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          onFilesSelected(result.assets.map(asset => ({ ...asset, status: 'pending', uploadedAt: Date.now() })));
        } else {
          setError('No photo captured.');
        }
      } catch (error) {
        console.error('Camera error:', error);
        setError('Failed to capture photo. Please try again.');
      }
    }
  };

  // Handle confirm/delete/return for video preview
  const handleConfirmVideo = () => {
    if (videoPreview) {
      console.log('videoPreview---', videoPreview);
      handleUpload([{ ...videoPreview, status: 'pending', uploadedAt: Date.now() }]);
      setVideoPreview(null);
      setShowPreview(false);
    }
  };

  const handleDeleteVideo = () => {
    setVideoPreview(null);
    setShowPreview(false);
  };

  const handleReturn = () => {
    setVideoPreview(null);
    setShowPreview(false);
  };

  const handleUpload = async (files: any[]) => {
    console.log('files---', files);
    setUploading(true);
    try {
      await onFilesSelected(files);
    } finally {
      setUploading(false);
    }
  };

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

      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={() => setShowCamera(false)}
      >
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            mode="video"
          >
            <View style={styles.cameraControls}>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={() => setShowCamera(false)}
              >
                <Text style={styles.cameraButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cameraButton, isRecording ? styles.stopButton : styles.recordButton]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                <Text style={styles.cameraButtonText}>
                  {isRecording ? 'Stop' : 'Record'}
                </Text>
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      </Modal>

      <Modal
        visible={showPreview}
        transparent={true}
        animationType="slide"
        onRequestClose={handleReturn}
      >
        <View style={styles.modalContainer}>
          <View style={styles.previewContainer}>
            <Text style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 18 }}>Video Preview</Text>
            {videoPreview && (
              <Video
                source={{ uri: videoPreview.uri }}
                style={{ width: 300, height: 200, backgroundColor: '#000' }}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
              />
            )}
            <View style={styles.previewButtons}>
              <TouchableOpacity 
                style={[styles.previewButton, { backgroundColor: '#2f95dc' }]} 
                onPress={handleConfirmVideo}
              >
                <Text style={styles.previewButtonText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.previewButton, { backgroundColor: '#e74c3c' }]} 
                onPress={handleDeleteVideo}
              >
                <Text style={styles.previewButtonText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.previewButton, { backgroundColor: '#888' }]} 
                onPress={handleReturn}
              >
                <Text style={styles.previewButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {uploading && (
        <View style={{ alignItems: 'center', marginVertical: 16 }}>
          <ActivityIndicator size="large" color="#2f95dc" />
          <Text>Uploading...</Text>
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
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  previewContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    width: '90%',
    maxWidth: 400,
  },
  previewButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    width: '100%',
  },
  previewButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    minWidth: 100,
    alignItems: 'center',
  },
  previewButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingBottom: 40,
  },
  cameraButton: {
    padding: 15,
    borderRadius: 50,
    backgroundColor: '#2f95dc',
    minWidth: 100,
    alignItems: 'center',
  },
  cameraButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  recordButton: {
    backgroundColor: '#e74c3c',
  },
  stopButton: {
    backgroundColor: '#2f95dc',
  },
});
