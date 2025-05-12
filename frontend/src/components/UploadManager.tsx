import React, { useState, useCallback, useEffect } from 'react';
import { Box, Button, LinearProgress, Typography, Alert, List, ListItem, ListItemText, IconButton, Card, CardContent } from '@mui/material';
import { Delete as DeleteIcon, Pause as PauseIcon, PlayArrow as PlayArrowIcon, Replay as ReplayIcon, CloudUpload as CloudUploadIcon } from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { logger } from '../utils/logger';
import { getPersistedUploads, clearUploadState } from '../utils/uploadState';

interface UploadManagerProps {
  onUploadComplete: (uploadIds: string[]) => void;
  onError: (error: UploadError) => void;
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
  error?: UploadError;
  shouldCancel?: boolean;
  uploadStartTime?: number;
  bytesUploaded?: number;
  currentSpeed?: number;
  lastUpdateTime?: number;
  preview?: string;
}

type ErrorCategory = 'NETWORK' | 'VALIDATION' | 'SERVER' | 'PERMISSION' | 'UNKNOWN';

interface UploadError {
  message: string;
  category: ErrorCategory;
  details?: string;
}

interface UploadHistory {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'completed' | 'failed';
  timestamp: number;
  error?: UploadError;
}

const CHUNK_SIZE = 512 * 1024; // 512KB chunks
const MAX_FILES = 10;
const MAX_CONCURRENT_UPLOADS = 3; // Back to 3 concurrent uploads
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;
const CHUNK_UPLOAD_TIMEOUT = 30000;
const MAX_CHUNK_RETRIES = 5;
const CHUNK_DELAY = 200;
const RATE_LIMIT_DELAY = 5000;
const INITIALIZATION_DELAY = 2000;
const MAX_INIT_RETRIES = 5;
const BATCH_DELAY = 1000;
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB threshold
const MIN_CHUNK_DELAY = 50; // Minimum delay between chunks
const SERVER_RECOVERY_DELAY = 5000; // 5 seconds to wait for server recovery
const MAX_SERVER_RETRIES = 3; // Maximum number of server recovery retries

export const UploadManager: React.FC<UploadManagerProps> = ({
  onUploadComplete,
  onError
}) => {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const uploadAbortControllers = React.useRef<Record<string, AbortController>>({});
  const uploadQueue = React.useRef<File[]>([]);
  const activeUploads = React.useRef<Set<string>>(new Set());
  const lastInitTime = React.useRef<number>(0);
  const initRetryCount = React.useRef<Record<string, number>>({});

  useEffect(() => {
    const loadPersistedUploads = async () => {
      const uploads = await getPersistedUploads();
      setFiles(uploads);
    };
    loadPersistedUploads();

    // Load upload history from localStorage
    const savedHistory = localStorage.getItem('uploadHistory');
    if (savedHistory) {
      setUploadHistory(JSON.parse(savedHistory));
    }
  }, []);

  const updateUploadHistory = (newHistory: UploadHistory) => {
    setUploadHistory(prev => {
      const updated = [...prev, newHistory].slice(-50); // Keep last 50 entries
      localStorage.setItem('uploadHistory', JSON.stringify(updated));
      return updated;
    });
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = file.type.startsWith('image/') || file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const maxSize = isImage ? 50 * 1024 * 1024 : 1024 * 1024 * 1024; // 50MB for images, 1GB for videos
      const isValidSize = file.size <= maxSize;
      const isValidExtension = /\.(jpg|jpeg|png|gif|mp4|webm)$/i.test(file.name);

      if (!isValidType) {
        onError({
          message: `Invalid file type: ${file.name}`,
          category: 'VALIDATION',
          details: 'Only image and video files are allowed'
        });
        return false;
      }
      if (!isValidSize) {
        onError({
          message: `File too large: ${file.name}`,
          category: 'VALIDATION',
          details: isImage ? 'Maximum image size is 50MB' : 'Maximum video size is 1GB'
        });
        return false;
      }
      if (!isValidExtension) {
        onError({
          message: `Invalid file extension: ${file.name}`,
          category: 'VALIDATION',
          details: 'Only .jpg, .jpeg, .png, .gif, .mp4, and .webm files are allowed'
        });
        return false;
      }
      return true;
    });

    const newFiles = validFiles.map(file => ({
      file,
      uploadId: null,
      progress: null,
      status: 'pending' as const,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    }));

    setFiles(prev => {
      const updatedFiles = [...prev, ...newFiles];
      return updatedFiles.slice(0, MAX_FILES);
    });
  }, [onError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
      'video/*': ['.mp4', '.webm'],
    },
    maxSize: 1024 * 1024 * 1024, // 1GB max size
    maxFiles: MAX_FILES,
  });

  const initializeUploadWithRetry = async (file: File): Promise<string> => {
    const fileKey = `${file.name}-${file.size}`;
    const retryCount = initRetryCount.current[fileKey] || 0;
    let serverRetryCount = 0;

    while (serverRetryCount < MAX_SERVER_RETRIES) {
      try {
        // Add exponential backoff delay
        const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        
        // Add delay between initialization requests
        const now = Date.now();
        const timeSinceLastInit = now - lastInitTime.current;
        if (timeSinceLastInit < INITIALIZATION_DELAY) {
          await new Promise(resolve => setTimeout(resolve, INITIALIZATION_DELAY - timeSinceLastInit));
        }
        lastInitTime.current = Date.now();

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

        if (response.status === 429) {
          throw new Error('Too many requests');
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to initialize upload');
        }

        const data = await response.json();
        if (!data.uploadId) {
          throw new Error('No upload ID received from server');
        }

        // Reset retry count on success
        delete initRetryCount.current[fileKey];
        return data.uploadId;
      } catch (error) {
        if (error instanceof Error && (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('Proxy error')
        )) {
          serverRetryCount++;
          if (serverRetryCount < MAX_SERVER_RETRIES) {
            console.log(`Server connection error, waiting ${SERVER_RECOVERY_DELAY}ms before retry ${serverRetryCount}/${MAX_SERVER_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, SERVER_RECOVERY_DELAY));
            continue;
          }
        }

        if (retryCount < MAX_INIT_RETRIES) {
          initRetryCount.current[fileKey] = retryCount + 1;
          return initializeUploadWithRetry(file);
        }
        throw error;
      }
    }
    throw new Error('Server is not responding after multiple retries');
  };

  const processUploadQueue = async () => {
    if (uploadQueue.current.length === 0) {
      setIsUploading(false);
      return;
    }

    // Process up to MAX_CONCURRENT_UPLOADS files at once
    const availableSlots = MAX_CONCURRENT_UPLOADS - activeUploads.current.size;
    if (availableSlots <= 0) return;

    const filesToProcess = uploadQueue.current.slice(0, availableSlots);
    
    // Process each file
    for (const file of filesToProcess) {
      try {
        // Remove from queue before processing
        uploadQueue.current = uploadQueue.current.filter(f => f !== file);
        
        // Initialize upload with retry mechanism
        const uploadId = await initializeUploadWithRetry(file);
        activeUploads.current.add(uploadId);
        
        try {
          await startUploadForFile(file);
        } finally {
          // Remove from active uploads when done
          activeUploads.current.delete(uploadId);
          // Process next batch if queue is not empty
          if (uploadQueue.current.length > 0) {
            setTimeout(() => processUploadQueue(), 100);
          } else {
            setIsUploading(false);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Too many requests')) {
          // If rate limited, put back in queue and wait
          uploadQueue.current = [file, ...uploadQueue.current];
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
          if (uploadQueue.current.length > 0) {
            setTimeout(() => processUploadQueue(), 100);
          } else {
            setIsUploading(false);
          }
        } else {
          setFiles(prev => prev.map(f => 
            f.file === file ? { 
              ...f, 
              status: 'error',
              error: {
                message: error instanceof Error ? error.message : 'Upload failed',
                category: 'NETWORK',
                details: error instanceof Error ? error.stack : undefined
              }
            } : f
          ));
          if (uploadQueue.current.length > 0) {
            setTimeout(() => processUploadQueue(), 100);
          } else {
            setIsUploading(false);
          }
        }
      }
    }
  };

  const startUploadForFile = async (file: File) => {
    const fileUpload = files.find(f => f.file === file);
    if (!fileUpload) return;

    let uploadId: string | null = null;
    try {
      const abortController = new AbortController();
      
      uploadId = fileUpload.uploadId || await initializeUploadWithRetry(file);
      if (!uploadId) {
        throw new Error('Failed to get upload ID');
      }
      uploadAbortControllers.current[uploadId] = abortController;

      const existingProgress = fileUpload.progress;
      const startChunk = existingProgress?.uploadedChunks || 0;
      const now = Date.now();
      const totalChunks = Math.ceil(fileUpload.file.size / CHUNK_SIZE);

      setFiles(prev => prev.map(f => 
        f.file === file ? { 
          ...f, 
          status: 'uploading', 
          uploadId,
          uploadStartTime: now,
          lastUpdateTime: now,
          bytesUploaded: startChunk * CHUNK_SIZE,
          currentSpeed: 0,
          progress: {
            uploadedChunks: startChunk,
            totalChunks,
            progress: (startChunk / totalChunks) * 100
          }
        } : f
      ));

      let lastError: Error | null = null;
      let lastSpeedUpdate = now;
      let lastBytesUploaded = startChunk * CHUNK_SIZE;

      for (let i = startChunk; i < totalChunks; i++) {
        const currentFile = files.find(f => f.file === file);
        if (currentFile?.shouldCancel) {
          console.log('Upload cancelled, stopping:', { uploadId });
          setFiles(prev => prev.map(f => 
            f.file === file ? { ...f, status: 'error', error: { message: 'Upload cancelled', category: 'PERMISSION' } } : f
          ));
          onError({ message: 'Upload cancelled', category: 'PERMISSION' });
          return;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileUpload.file.size);
        const chunk = fileUpload.file.slice(start, end);

        try {
          await uploadChunkWithRetry(chunk, i, uploadId, totalChunks);
          lastError = null;

          const now = Date.now();
          const bytesUploaded = Math.min((i + 1) * CHUNK_SIZE, fileUpload.file.size);
          const timeDiff = (now - lastSpeedUpdate) / 1000; // Convert to seconds
          
          // Update progress immediately after each chunk
          setFiles(prev => prev.map(f => 
            f.file === file ? {
              ...f,
              progress: {
                uploadedChunks: i + 1,
                totalChunks,
                progress: ((i + 1) / totalChunks) * 100
              },
              bytesUploaded,
              lastUpdateTime: now
            } : f
          ));
          
          if (timeDiff >= 1) { // Update speed every second
            const bytesDiff = bytesUploaded - lastBytesUploaded;
            const currentSpeed = bytesDiff / timeDiff / (1024 * 1024); // Convert to MB/s
            
            setFiles(prev => prev.map(f => 
              f.file === file ? {
                ...f,
                currentSpeed
              } : f
            ));
            
            lastSpeedUpdate = now;
            lastBytesUploaded = bytesUploaded;
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'Upload was cancelled') {
            return;
          }
          lastError = error instanceof Error ? error : new Error('Unknown error');
          throw error;
        }
      }

      if (lastError) {
        throw lastError;
      }

      // Ensure final progress is exactly 100%
      setFiles(prev => prev.map(f =>
        f.file === file ? { 
          ...f, 
          status: 'completed', 
          currentSpeed: 0,
          progress: {
            uploadedChunks: totalChunks,
            totalChunks,
            progress: 100
          }
        } : f
      ));
      onUploadComplete([uploadId]);
    } catch (error) {
      console.error('Upload failed:', error);
      setFiles(prev => prev.map(f => 
        f.file === file ? { 
          ...f, 
          status: 'error',
          error: {
            message: error instanceof Error ? error.message : 'Upload failed',
            category: 'NETWORK',
            details: error instanceof Error ? error.stack : undefined
          }
        } : f
      ));
      onError({
        message: error instanceof Error ? error.message : 'Upload failed',
        category: 'NETWORK',
        details: error instanceof Error ? error.stack : undefined
      });
    } finally {
      if (uploadId) {
        delete uploadAbortControllers.current[uploadId];
      }
    }
  };

  const startUpload = useCallback(async () => {
    if (isUploading) return;
    setIsUploading(true);

    const pendingFiles = files.filter(f => (f.status === 'pending' || f.status === 'paused') && !f.shouldCancel);
    
    // Separate large and small files
    const largeFiles = pendingFiles.filter(f => f.file.size > LARGE_FILE_THRESHOLD);
    const smallFiles = pendingFiles.filter(f => f.file.size <= LARGE_FILE_THRESHOLD);
    
    // Sort files by size
    const sortedLargeFiles = [...largeFiles].sort((a, b) => a.file.size - b.file.size);
    const sortedSmallFiles = [...smallFiles].sort((a, b) => a.file.size - b.file.size);
    
    // Process files in parallel with concurrency control
    const processFile = async (fileUpload: FileUpload) => {
      try {
        await startUploadForFile(fileUpload.file);
      } catch (error) {
        console.error('Upload failed:', error);
        setFiles(prev => prev.map(f => 
          f.file === fileUpload.file ? { 
            ...f, 
            status: 'error',
            error: {
              message: error instanceof Error ? error.message : 'Upload failed',
              category: 'NETWORK',
              details: error instanceof Error ? error.stack : undefined
            }
          } : f
        ));
      }
    };

    // Process large files one at a time
    for (const file of sortedLargeFiles) {
      try {
        await processFile(file);
        // Add delay after each large file
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      } catch (error) {
        console.error('Large file processing error:', error);
      }
    }

    // Process small files in parallel batches
    for (let i = 0; i < sortedSmallFiles.length; i += MAX_CONCURRENT_UPLOADS) {
      const batch = sortedSmallFiles.slice(i, i + MAX_CONCURRENT_UPLOADS);
      try {
        await Promise.all(batch.map(processFile));
        // Add delay between batches
        if (i + MAX_CONCURRENT_UPLOADS < sortedSmallFiles.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      } catch (error) {
        console.error('Batch processing error:', error);
      }
    }
    
    setIsUploading(false);
  }, [files, isUploading, startUploadForFile]);

  const handleRetry = async (file: File) => {
    try {
      setFiles(prev => prev.map(f => 
        f.file === file ? {
          ...f,
          status: 'pending',
          error: undefined,
          shouldCancel: false,
          progress: null,
          uploadId: null,
          bytesUploaded: 0,
          currentSpeed: 0
        } : f
      ));

      if (!isUploading) {
        startUpload();
      }
    } catch (error) {
      console.error('Retry failed:', error);
      setFiles(prev => prev.map(f => 
        f.file === file ? { 
          ...f, 
          status: 'error',
          error: {
            message: error instanceof Error ? error.message : 'Failed to retry upload',
            category: 'NETWORK',
            details: error instanceof Error ? error.stack : 'Unknown error'
          }
        } : f
      ));
    }
  };

  const handleResume = async (file: File) => {
    const fileUpload = files.find(f => f.file === file);
    if (!fileUpload) return;

    try {
      setFiles(prev => prev.map(f => 
        f.file === file ? { 
          ...f, 
          status: 'pending',
          shouldCancel: false,
          error: undefined
        } : f
      ));
      
      if (!isUploading) {
        startUpload();
      }
    } catch (error) {
      console.error('Resume failed:', error);
      setFiles(prev => prev.map(f => 
        f.file === file ? { 
          ...f, 
          status: 'error',
          error: {
            message: error instanceof Error ? error.message : 'Failed to resume upload',
            category: 'NETWORK',
            details: error instanceof Error ? error.stack : 'Unknown error'
          }
        } : f
      ));
    }
  };

  const uploadChunkWithRetry = async (
    chunk: Blob,
    chunkIndex: number,
    uploadId: string,
    totalChunks: number,
    retryCount = 0
  ): Promise<void> => {
    const abortController = uploadAbortControllers.current[uploadId];
    if (!abortController) {
      throw new Error('Upload was cancelled');
    }

    let serverRetryCount = 0;
    while (serverRetryCount < MAX_SERVER_RETRIES) {
      try {
        // Add delay between chunks to prevent rate limits
        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());
        formData.append('fileType', chunk.type || '');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CHUNK_UPLOAD_TIMEOUT);

        const response = await fetch(`/api/upload/chunk/${uploadId}`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          if (retryCount < MAX_CHUNK_RETRIES) {
            const baseDelay = RATE_LIMIT_DELAY * Math.pow(2, retryCount);
            const jitter = Math.random() * 1000;
            const backoffDelay = Math.min(baseDelay + jitter, 30000);
            console.log(`Rate limited, retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${MAX_CHUNK_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            return uploadChunkWithRetry(chunk, chunkIndex, uploadId, totalChunks, retryCount + 1);
          }
          throw new Error('Too many requests after maximum retries');
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to upload chunk');
        }

        const data = await response.json();
        return data;
      } catch (error) {
        if (abortController.signal.aborted) {
          throw new Error('Upload was cancelled');
        }

        if (error instanceof Error && (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('Proxy error')
        )) {
          serverRetryCount++;
          if (serverRetryCount < MAX_SERVER_RETRIES) {
            console.log(`Server connection error, waiting ${SERVER_RECOVERY_DELAY}ms before retry ${serverRetryCount}/${MAX_SERVER_RETRIES}`);
            await new Promise(resolve => setTimeout(resolve, SERVER_RECOVERY_DELAY));
            continue;
          }
        }

        if (retryCount < MAX_RETRIES && (
          error instanceof TypeError ||
          error instanceof Error && (
            error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('timeout')
          )
        )) {
          const baseDelay = RETRY_DELAY * Math.pow(2, retryCount);
          const jitter = Math.random() * 1000;
          const backoffDelay = Math.min(baseDelay + jitter, 15000);
          console.log(`Network error, retrying in ${backoffDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          return uploadChunkWithRetry(chunk, chunkIndex, uploadId, totalChunks, retryCount + 1);
        }

        throw error;
      }
    }
    throw new Error('Server is not responding after multiple retries');
  };

  const handlePause = (file: File) => {
    const fileUpload = files.find(f => f.file === file);
    if (!fileUpload) return;

    const uploadId = fileUpload.uploadId;
    if (uploadId && uploadAbortControllers.current[uploadId]) {
      uploadAbortControllers.current[uploadId].abort();
      delete uploadAbortControllers.current[uploadId];
    }

    setFiles(prev => prev.map(f => 
      f.file === file ? { 
        ...f, 
        status: 'paused',
        shouldCancel: false,
        // Preserve the current progress and upload ID
        progress: f.progress,
        uploadId: f.uploadId,
        bytesUploaded: f.bytesUploaded,
        currentSpeed: 0
      } : f
    ));
  };

  const handleCancel = async (file: File) => {
    setFiles(prev => prev.map(f => 
      f.file === file ? { ...f, shouldCancel: true, status: 'error', error: { message: 'Upload cancelled', category: 'PERMISSION' } } : f
    ));
    const uploadId = files.find(f => f.file === file)?.uploadId;
    if (uploadId && uploadAbortControllers.current[uploadId]) {
      uploadAbortControllers.current[uploadId].abort();
      delete uploadAbortControllers.current[uploadId];
    }
    if (uploadId) {
      try {
        await fetch(`/api/upload/${uploadId}`, { method: 'DELETE' });
      } catch (e) {
        logger.error('Failed to delete upload on server', e);
      }
    }
    setFiles(prev => prev.filter(f => f.file !== file));
  };

  const handleRemove = (file: File) => {
    setFiles(prev => prev.filter(f => f.file !== file));
    const fileUpload = files.find(f => f.file === file);
    if (fileUpload?.preview) {
      URL.revokeObjectURL(fileUpload.preview);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      <Card>
        <CardContent>
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'grey.300',
              borderRadius: 1,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
              },
            }}
          >
            <input {...getInputProps()} data-testid="file-input" />
            <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {isDragActive ? 'Drop the files here' : 'Drag and drop files here, or click to select files'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Supported formats: Images (JPEG, PNG, GIF) and Videos (MP4, WebM)
              <br />
              Maximum file size: Images (50MB), Videos (1GB)
              <br />
              Maximum files: 10
            </Typography>
          </Box>

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
                        <Alert 
                          severity="error" 
                          sx={{ mt: 1 }}
                          title={fileUpload.error.category}
                        >
                          {fileUpload.error.message}
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
        </CardContent>
      </Card>
    </Box>
  );
}; 