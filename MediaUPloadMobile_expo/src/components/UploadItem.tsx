import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, Button, Image } from 'react-native';

const CHUNK_SIZE = 1024 * 1024; // 1MB

const UploadItem = forwardRef(function UploadItem(
  {
    file,
    onStateChange,
  }: {
    file: any;
    onStateChange: (state: any) => void;
  },
  ref
) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'paused' | 'completed' | 'error' | 'canceled'>('idle');
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const totalChunks = Math.ceil(file.fileSize / CHUNK_SIZE);
  const controller = useRef<{ paused: boolean; canceled: boolean }>({ paused: false, canceled: false });
  const lastSpeed = useRef(0);

  // Simulate chunk upload
  const uploadChunk = async (chunkIndex: number) => {
    return new Promise<void>((resolve, reject) => {
      const delay = 200 + Math.random() * 200;
      setTimeout(() => {
        if (Math.random() < 0.05) reject(new Error('Network error'));
        else resolve();
      }, delay);
    });
  };

  const startUpload = async () => {
    setStatus('uploading');
    setError(null);
    controller.current = { paused: false, canceled: false };
    let uploaded = 0;
    let startTime = Date.now();
    for (let i = currentChunk; i < totalChunks; i++) {
      if (controller.current.canceled) {
        setStatus('canceled');
        setError('Upload canceled');
        onStateChange({ progress: 0, status: 'canceled', error: 'Upload canceled' });
        return;
      }
      while (controller.current.paused) {
        await new Promise(res => setTimeout(res, 200));
      }
      let retries = 0;
      while (retries < 3) {
        try {
          await uploadChunk(i);
          break;
        } catch (e) {
          retries++;
          if (retries >= 3) {
            setStatus('error');
            setError('Upload failed after 3 retries');
            onStateChange({ progress, status: 'error', error: 'Upload failed after 3 retries' });
            return;
          }
          await new Promise(res => setTimeout(res, 500 * Math.pow(2, retries)));
        }
        if (controller.current.canceled) {
          setStatus('canceled');
          setError('Upload canceled');
          onStateChange({ progress: 0, status: 'canceled', error: 'Upload canceled' });
          return;
        }
      }
      uploaded += CHUNK_SIZE;
      setCurrentChunk(i + 1);
      const percent = Math.min(1, uploaded / file.fileSize);
      setProgress(percent);
      setRetryCount(retries);
      const elapsed = (Date.now() - startTime) / 1000;
      const spd = Math.round((uploaded / 1024) / (elapsed || 1)); // KB/s
      setSpeed(spd);
      lastSpeed.current = spd;
      onStateChange({ progress: percent, status: 'uploading', speed: spd, error: null });
    }
    setStatus('completed');
    setProgress(1);
    setSpeed(lastSpeed.current); // Keep last speed
    onStateChange({ progress: 1, status: 'completed', error: null });
  };

  useImperativeHandle(ref, () => ({
    start: startUpload,
  }));

  const pauseUpload = () => {
    controller.current.paused = true;
    setStatus('paused');
    onStateChange({ progress, status: 'paused', error: null });
  };

  const resumeUpload = () => {
    controller.current.paused = false;
    setStatus('uploading');
    startUpload();
  };

  const cancelUpload = () => {
    controller.current.canceled = true;
    setStatus('canceled');
    setError('Upload canceled');
    onStateChange({ progress: 0, status: 'canceled', error: 'Upload canceled' });
  };

  return (
    <View style={{ marginVertical: 10, backgroundColor: '#fff', borderRadius: 8, padding: 12, elevation: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {file.type === 'image' ? (
          <Image source={{ uri: file.uri }} style={{ width: 48, height: 48, borderRadius: 6, marginRight: 12 }} />
        ) : (
          <View style={{ width: 48, height: 48, borderRadius: 6, marginRight: 12, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }}>
            <Text>🎬</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontWeight: 'bold', maxWidth: 180 }}>{file.fileName || file.uri.split('/').pop()}</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>{file.fileSize ? (file.fileSize / 1024).toFixed(1) : ''} KB</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>Progress: {(progress * 100).toFixed(1)}%</Text>
          <View style={{ height: 8, width: '100%', backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden', marginVertical: 4 }}>
            <View style={{ height: 8, width: `${progress * 100}%`, backgroundColor: '#2f95dc' }} />
          </View>
          <Text style={{ fontSize: 12, color: '#666' }}>Speed: {speed} KB/s</Text>
          {error && <Text style={{ color: 'red', fontSize: 12 }}>{error}</Text>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8, justifyContent: 'flex-end' }}>
        {status === 'uploading' ? (
          <>
            <Button title="Pause" onPress={pauseUpload} />
            <View style={{ width: 8 }} />
            <Button title="Cancel" onPress={cancelUpload} />
          </>
        ) : null}
        {status === 'paused' ? (
          <Button title="Resume" onPress={resumeUpload} />
        ) : null}
        {status === 'error' ? (
          <Button title="Retry" onPress={startUpload} />
        ) : null}
        {status === 'completed' ? (
          <Text style={{ color: 'green', marginLeft: 8 }}>Done</Text>
        ) : null}
      </View>
    </View>
  );
});

export default UploadItem;
