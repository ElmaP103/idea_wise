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
      logger.info('Starting chunk upload:', {
        chunkIndex,
      uploadId,
        retryCount,
      chunkSize: chunkData.size
    });

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
        // Wait and retry, with exponential backoff
        if (retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
          return uploadChunk(chunkData, chunkIndex, uploadId, retryCount + 1);
        }
        throw new Error('Too many requests');
      }

      if (!response.ok) {
        const errorText = await response.text();
          logger.error('Chunk upload failed:', {
            status: response.status,
          statusText: response.statusText,
          errorText,
            uploadId,
            chunkIndex,
            retryCount
          });
          
        if (retryCount < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, retryCount);
          logger.info('Retrying chunk upload:', {
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

        const result = await response.json();
      logger.info('Chunk uploaded successfully:', {
          uploadId,
          chunkIndex,
          result
        });
      } catch (error) {
      if (abortController?.signal.aborted) {
        logger.info('Chunk upload aborted:', { uploadId, chunkIndex });
        throw new Error('Upload paused or cancelled');
      }
      logger.error('Chunk upload error:', {
        error,
            uploadId,
        chunkIndex,
        retryCount
          });
        
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY * Math.pow(2, retryCount);
        logger.info('Retrying chunk upload after error:', {
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
          setFiles(prev => prev.map(f => 
            f.file === fileUpload.file ? { ...f, status: 'uploading', uploadStartTime: Date.now(), bytesUploaded: 0, currentSpeed: 0 } : f
          ));

          let currentUploadId = fileUpload.uploadId;
          if (!currentUploadId) {
            currentUploadId = await initializeUpload(fileUpload.file);
            setFiles(prev => prev.map(f => 
              f.file === fileUpload.file ? { ...f, uploadId: currentUploadId } : f
            ));
          }

          if (!currentUploadId) {
            throw new Error('Failed to get upload ID');
          }

          // Create an AbortController for this upload
          uploadAbortControllers.current[currentUploadId] = new AbortController();

          const totalChunks = Math.ceil(fileUpload.file.size / CHUNK_SIZE);
          let startChunk = fileUpload.progress?.uploadedChunks || 0;

          for (let i = startChunk; i < totalChunks; i++) {
            // On first chunk, set uploadStartTime if not already set
            if (i === 0 || !fileUpload.uploadStartTime) {
              setFiles(prev => prev.map(f =>
                f.file === fileUpload.file
                  ? { ...f, uploadStartTime: Date.now(), bytesUploaded: 0, currentSpeed: 0 }
                  : f
              ));
              fileUpload.uploadStartTime = Date.now();
            }

            // Check for pause or cancel before each chunk
            const currentFile = files.find(f => f.file === fileUpload.file);
            if (currentFile?.status === 'paused' || currentFile?.shouldCancel) {
              logger.info('Upload paused or cancelled, stopping:', { uploadId: currentUploadId });
              // Only set error if cancelled, not paused
              if (currentFile?.shouldCancel) {
                setFiles(prev => prev.map(f => 
                  f.file === fileUpload.file ? { ...f, status: 'error', error: 'Upload cancelled' } : f
                ));
                onError('Upload cancelled');
              }
              // For pause, just break/return without error
              return;
            }

            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, fileUpload.file.size);
            const chunk = fileUpload.file.slice(start, end);

            await uploadChunk(chunk, i, currentUploadId);

            const newProgress = {
              uploadedChunks: i + 1,
              totalChunks,
              progress: ((i + 1) / totalChunks) * 100,
            };

            const now = Date.now();
            const elapsedSeconds = (now - (fileUpload.uploadStartTime || now)) / 1000;
            // Use i+1 for bytesUploaded, always capped at file size
            const bytesUploaded = Math.min((i + 1) * CHUNK_SIZE, fileUpload.file.size);
            const currentSpeed = elapsedSeconds > 0 ? (bytesUploaded / elapsedSeconds) / (1024 * 1024) : 0;

            setFiles(prev => prev.map(f => 
              f.file === fileUpload.file
                ? {
                    ...f,
                    progress: newProgress,
                    bytesUploaded,
                    currentSpeed
                  }
                : f
            ));

            const status = await checkUploadStatus(currentUploadId);
            if (status.status === 'completed') {
              // Set final speed for completed upload
              const finalNow = Date.now();
              const finalElapsedSeconds = (finalNow - (fileUpload.uploadStartTime || finalNow)) / 1000;
              const finalSpeed = finalElapsedSeconds > 0 ? (fileUpload.file.size / finalElapsedSeconds) / (1024 * 1024) : 0;
              setFiles(prev => prev.map(f =>
                f.file === fileUpload.file ? { ...f, status: 'completed', currentSpeed: finalSpeed } : f
              ));
              // Always PATCH final speed to backend
              if (currentUploadId) {
                try {
                  await fetch(`/api/upload/${currentUploadId}/speed`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uploadSpeed: finalSpeed })
                  });
                } catch (e) {
                  logger.error('Failed to update upload speed on server', e);
                }
              }
              completedUploadIds.push(currentUploadId);
              return;
            }
          }

          // After upload completes, set final speed (for uploads that don't hit the early return)
          const now = Date.now();
          const elapsedSeconds = (now - (fileUpload.uploadStartTime || now)) / 1000;
          const finalSpeed = elapsedSeconds > 0 ? (fileUpload.file.size / elapsedSeconds) / (1024 * 1024) : 0;
          setFiles(prev => prev.map(f =>
            f.file === fileUpload.file
              ? { ...f, status: 'completed', currentSpeed: finalSpeed }
              : f
          ));
          // Always PATCH final speed to backend
          if (currentUploadId) {
            try {
              await fetch(`/api/upload/${currentUploadId}/speed`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadSpeed: finalSpeed })
              });
            } catch (e) {
              logger.error('Failed to update upload speed on server', e);
            }
          }
          completedUploadIds.push(currentUploadId);
        } catch (error) {
          logger.error('Upload failed:', error);
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
    console.log('paused-------')
    setFiles(prev => prev.map(f => 
      f.file === file ? { ...f, status: 'paused' } : f
    ));
    const uploadId = files.find(f => f.file === file)?.uploadId;
    if (uploadId && uploadAbortControllers.current[uploadId]) {
      uploadAbortControllers.current[uploadId].abort();
    }
  };

  const handleResume = (file: File) => {
    setFiles(prev => prev.map(f => 
      f.file === file ? { ...f, status: 'pending' } : f
    ));
    startUpload();
  };

  const handleCancel = async (file: File) => {
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
                  <IconButton onClick={() => handlePause(fileUpload.file)}>
                    <PauseIcon />
                  </IconButton>
                )}
                {fileUpload.status === 'paused' && (
                  <IconButton onClick={() => handleResume(fileUpload.file)}>
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