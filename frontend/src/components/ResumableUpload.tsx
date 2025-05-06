import React, { useState, useCallback, useEffect } from 'react';
import { Box, Button, LinearProgress, Typography, Alert, List, ListItem, ListItemText, IconButton } from '@mui/material';
import { Delete as DeleteIcon, Pause as PauseIcon, PlayArrow as PlayArrowIcon, Replay as ReplayIcon } from '@mui/icons-material';
import { logger } from '../utils/logger';
import { getPersistedUploads, clearUploadState } from '../utils/uploadState';

interface ResumableUploadProps {
  onUploadComplete: (uploadIds: string[]) => void;
  onError: (error: string) => void;
}

interface UploadProgress {
  uploadedChunks: number;
  totalChunks: number;
  progress: number;
}

interface FileUpload {
  file: File;
  uploadId: string | null;
  progress: UploadProgress | null;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
  shouldCancel?: boolean;
  uploadStartTime?: number;
  bytesUploaded?: number;
  currentSpeed?: number; // in MB/s
  lastUpdateTime?: number; // Add this field to track last speed update
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
const MAX_FILES = 10;
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

export const ResumableUpload: React.FC<ResumableUploadProps> = ({
  onUploadComplete,
  onError
}) => {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const uploadAbortControllers = React.useRef<Record<string, AbortController>>({});

  useEffect(() => {
    const loadPersistedUploads = async () => {
      const uploads = await getPersistedUploads();
      setFiles(uploads);
    };
    loadPersistedUploads();
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleFileSelect-------');
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 0) {
      const newFiles = selectedFiles.map(file => ({
        file,
        uploadId: null,
        progress: null,
        status: 'pending' as const
      }));
      
      setFiles(prev => {
        const updatedFiles = [...prev, ...newFiles];
        return updatedFiles.slice(0, MAX_FILES);
      });
    }
  };

  const initializeUpload = async (file: File) => {
    try {
      const response = await fetch('/api/upload/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          totalChunks: Math.ceil(file.size / CHUNK_SIZE),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to initialize upload');
      }

      const data = await response.json();
      return data.uploadId;
    } catch (error) {
      logger.error('Failed to initialize upload:', error);
      throw error;
    }
  };

  const uploadChunk = async (chunkData: Blob, chunkIndex: number, uploadId: string, retryCount = 0): Promise<void> => {
    const abortController = uploadAbortControllers.current[uploadId];
    try {
      console.log('Starting chunk upload:', { chunkIndex, uploadId, retryCount });

      const formData = new FormData();
      formData.append('chunk', chunkData);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('totalChunks', Math.ceil(chunkData.size / CHUNK_SIZE).toString());
      formData.append('fileType', chunkData.type || '');

      const response = await fetch(`/api/upload/chunk/${uploadId}`, {
        method: 'POST',
        body: formData,
        signal: abortController?.signal
      });

      if (response.status === 429) {
        if (retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
          return uploadChunk(chunkData, chunkIndex, uploadId, retryCount + 1);
        }
        throw new Error('Too many requests');
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Chunk upload failed:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          uploadId,
          chunkIndex,
          retryCount
        });
          
        if (retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, retryCount);
          console.log('Retrying chunk upload:', {
            uploadId,
            chunkIndex,
            retryCount: retryCount + 1,
            delay
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          return uploadChunk(chunkData, chunkIndex, uploadId, retryCount + 1);
        }

        throw new Error('Failed to upload chunk');
      }

      const data = await response.json();
      console.log('Chunk uploaded successfully:', { 
        uploadId, 
        chunkIndex, 
        speed: data.currentSpeed,
        progress: data.progress 
      });

      // Update the file's speed and progress from the backend response
      setFiles(prev => prev.map(f => 
        f.uploadId === uploadId
          ? {
              ...f,
              currentSpeed: data.currentSpeed,
              progress: {
                uploadedChunks: data.uploadedChunks,
                totalChunks: data.totalChunks,
                progress: data.progress
              }
            }
          : f
      ));
    } catch (error) {
      if (abortController?.signal.aborted) {
        console.log('Chunk upload aborted:', { uploadId, chunkIndex });
        // Don't throw error for pause, just return
        return;
      }
      console.error('Chunk upload error:', {
        error,
        uploadId,
        chunkIndex,
        retryCount
      });
        
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, retryCount);
        console.log('Retrying chunk upload after error:', {
          uploadId,
          chunkIndex,
          retryCount: retryCount + 1,
          delay
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        return uploadChunk(chunkData, chunkIndex, uploadId, retryCount + 1);
      }

      throw error;
    }
  };

  const checkUploadStatus = async (uploadId: string) => {
    const response = await fetch(`/api/upload/status/${uploadId}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to check upload status');
    }
    return response.json();
  };

  const startUpload = useCallback(async () => {
    setIsUploading(true);
    const pendingFiles = files.filter(f => (f.status === 'pending' || f.status === 'paused') && !f.shouldCancel);
    const completedUploadIds: string[] = [];

    for (let i = 0; i < pendingFiles.length; i += MAX_CONCURRENT_UPLOADS) {
      const batch = pendingFiles.slice(i, i + MAX_CONCURRENT_UPLOADS);
      await Promise.all(batch.map(async (fileUpload) => {
        try {
          // Create an AbortController for this upload before starting
          const abortController = new AbortController();
          const uploadId = fileUpload.uploadId || await initializeUpload(fileUpload.file);
          uploadAbortControllers.current[uploadId] = abortController;

          // If resuming, keep the existing progress
          const existingProgress = fileUpload.progress;
          const startChunk = existingProgress?.uploadedChunks || 0;
          const now = Date.now();

          setFiles(prev => prev.map(f => 
            f.file === fileUpload.file ? { 
              ...f, 
              status: 'uploading', 
              uploadId,
              uploadStartTime: now,
              lastUpdateTime: now,
              bytesUploaded: startChunk * CHUNK_SIZE,
              currentSpeed: 0,
              progress: existingProgress || {
                uploadedChunks: 0,
                totalChunks: Math.ceil(fileUpload.file.size / CHUNK_SIZE),
                progress: 0
              }
            } : f
          ));

          const totalChunks = Math.ceil(fileUpload.file.size / CHUNK_SIZE);

          for (let i = startChunk; i < totalChunks; i++) {
            // Only check for cancel, not pause
            const currentFile = files.find(f => f.file === fileUpload.file);
            if (currentFile?.shouldCancel) {
              console.log('Upload cancelled, stopping:', { uploadId });
              setFiles(prev => prev.map(f => 
                f.file === fileUpload.file ? { ...f, status: 'error', error: 'Upload cancelled' } : f
              ));
              onError('Upload cancelled');
              return;
            }

            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileUpload.file.size);
            const chunk = fileUpload.file.slice(start, end);

            try {
              const formData = new FormData();
              formData.append('chunk', chunk);
              formData.append('chunkIndex', i.toString());
              formData.append('totalChunks', totalChunks.toString());
              formData.append('fileType', chunk.type || '');

              const response = await fetch(`/api/upload/chunk/${uploadId}`, {
                method: 'POST',
                body: formData,
                signal: abortController.signal
              });

              if (!response.ok) {
                throw new Error('Failed to upload chunk');
              }

              const now = Date.now();
              const newProgress = {
                uploadedChunks: i + 1,
                totalChunks,
                progress: ((i + 1) / totalChunks) * 100,
              };

              // Calculate speed based on the last update
              const currentFile = files.find(f => f.file === fileUpload.file);
              const lastUpdateTime = currentFile?.lastUpdateTime || now;
              const lastBytesUploaded = currentFile?.bytesUploaded || 0;
              const bytesUploaded = Math.min((i + 1) * CHUNK_SIZE, fileUpload.file.size);
              const timeDiff = (now - lastUpdateTime) / 1000; // Convert to seconds
              const bytesDiff = bytesUploaded - lastBytesUploaded;
              const currentSpeed = timeDiff > 0 ? (bytesDiff / timeDiff) / (1024 * 1024) : 0; // Convert to MB/s

              setFiles(prev => prev.map(f => 
                f.file === fileUpload.file
                  ? {
                      ...f,
                      progress: newProgress,
                      bytesUploaded,
                      currentSpeed,
                      lastUpdateTime: now
                    }
                  : f
              ));
            } catch (error) {
              if (error instanceof Error && error.name === 'AbortError') {
                console.log('Upload aborted:', { uploadId });
                return;
              }
              throw error;
            }
          }

          setFiles(prev => prev.map(f =>
            f.file === fileUpload.file ? { ...f, status: 'completed' } : f
          ));
          completedUploadIds.push(uploadId);
        } catch (error) {
          console.error('Upload failed:', error);
          setFiles(prev => prev.map(f => 
            f.file === fileUpload.file ? { 
              ...f, 
              status: 'error',
              error: error instanceof Error ? error.message : 'Upload failed'
            } : f
          ));
          onError(error instanceof Error ? error.message : 'Upload failed');
        } finally {
          // Clean up abort controller
          if (fileUpload.uploadId) {
            delete uploadAbortControllers.current[fileUpload.uploadId];
          }
        }
      }));
    }

    if (completedUploadIds.length > 0) {
      onUploadComplete(completedUploadIds);
    }
    setIsUploading(false);
  }, [files, onUploadComplete, onError]);

  const handlePause = (file: File) => {
    console.log('Pause button clicked for file:', file.name);
    const uploadId = files.find(f => f.file === file)?.uploadId;
    console.log('Upload ID:', uploadId);
    
    if (uploadId && uploadAbortControllers.current[uploadId]) {
      console.log('ABORTING UPLOAD');
      uploadAbortControllers.current[uploadId].abort();
      delete uploadAbortControllers.current[uploadId];
    }

    setFiles(prev => prev.map(f => 
      f.file === file ? { ...f, status: 'paused', shouldCancel: false } : f
    ));
  };

  const handleResume = (file: File) => {
    console.log('Resume button clicked for file:', file.name);
    const fileUpload = files.find(f => f.file === file);
    if (!fileUpload) {
      console.log('File not found');
      return;
    }

    // Set status to pending to trigger upload
    setFiles(prev => prev.map(f => 
      f.file === file ? { 
        ...f, 
        status: 'pending',
        progress: f.progress,
        uploadId: f.uploadId,
        shouldCancel: false // Reset cancel flag
      } : f
    ));

    // Start the upload process
    startUpload();
  };

  const handleCancel = async (file: File) => {
    console.log('cancelling-------');
    setFiles(prev => prev.map(f =>
      f.file === file ? { ...f, shouldCancel: true, status: 'error', error: 'Upload cancelled' } : f
    ));
    const uploadId = files.find(f => f.file === file)?.uploadId;
    if (uploadId && uploadAbortControllers.current[uploadId]) {
      uploadAbortControllers.current[uploadId].abort();
      delete uploadAbortControllers.current[uploadId];
    }
    // Call backend to delete upload session and chunks
    if (uploadId) {
      try {
        await fetch(`/api/upload/${uploadId}`, { method: 'DELETE' });
      } catch (e) {
        logger.error('Failed to delete upload on server', e);
      }
    }
    // Remove from frontend state
    setFiles(prev => prev.filter(f => f.file !== file));
  };

  const handleRemove = (file: File) => {
    setFiles(prev => prev.filter(f => f.file !== file));
  };

  const handleRetry = (file: File) => {
    setFiles(prev =>
      prev.map(f =>
        f.file === file
          ? { ...f, status: 'pending', error: undefined }
          : f
      )
    );
    startUpload();
  };

  return (
    <Box sx={{ width: '100%', p: 2 }}>
      <input
        type="file"
        onChange={handleFileSelect}
        multiple
        accept="image/*,video/*"
        disabled={isUploading}
        style={{ display: 'none' }}
        id="file-upload"
      />
      <label htmlFor="file-upload">
        <Button
          variant="contained"
          component="span"
          disabled={isUploading || files.length >= MAX_FILES}
        >
          Select Files
        </Button>
      </label>

      <List sx={{ mt: 2 }}>
        {files.map((fileUpload, index) => (
          <ListItem
            key={index}
            secondaryAction={
              <Box>
                {fileUpload.status === 'uploading' && (
                  <IconButton 
                    onClick={() => {
                      console.log('Pause button clicked in UI');
                      handlePause(fileUpload.file);
                    }}
                  >
                    <PauseIcon />
                  </IconButton>
                )}
                {fileUpload.status === 'paused' && (
                  <IconButton 
                    onClick={() => {
                      console.log('Resume button clicked in UI');
                      handleResume(fileUpload.file);
                    }}
                  >
                    <PlayArrowIcon />
                  </IconButton>
                )}
                {fileUpload.status === 'error' && (
                  <IconButton onClick={() => handleRetry(fileUpload.file)}>
                    <ReplayIcon />
                  </IconButton>
                )}
                {(fileUpload.status === 'pending' || fileUpload.status === 'uploading' || fileUpload.status === 'paused') && (
                  <IconButton onClick={() => handleCancel(fileUpload.file)}>
                    <DeleteIcon />
                  </IconButton>
                )}
              </Box>
            }
          >
            <ListItemText
              primary={fileUpload.file.name}
              secondary={
                <Box component="div">
                  <div>
                    Status: {fileUpload.status}
                  </div>
                  {fileUpload.progress && (
                    <Box sx={{ mt: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={fileUpload.progress.progress}
                        sx={{ height: 10, borderRadius: 5, width: '85%', display: 'inline-block', verticalAlign: 'middle' }}
                      />
                      <div>
                        {fileUpload.progress.uploadedChunks} of {fileUpload.progress.totalChunks} chunks
                        ({fileUpload.progress.progress.toFixed(1)}%)
                      </div>
                    </Box>
                  )}
                  {typeof fileUpload.currentSpeed === 'number' && (fileUpload.status === 'uploading' || fileUpload.status === 'completed') && (
                    <div>
                      Speed: {fileUpload.currentSpeed.toFixed(2)} MB/s
                    </div>
                  )}
                  {fileUpload.error && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {fileUpload.error}
                    </Alert>
                  )}
                </Box>
              }
            />
          </ListItem>
        ))}
      </List>

      {files.length > 0 && (
        <Button
          variant="contained"
          color="primary"
          onClick={startUpload}
          disabled={isUploading || files.every(f => f.status === 'completed')}
          sx={{ mt: 2 }}
        >
          {files.some(f => f.status === 'paused') ? 'RESUME UPLOAD' : 'START UPLOAD'}
        </Button>
      )}
    </Box>
  );
}; 