import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

interface FileWithPreview extends File {
  preview?: string;
  uploadId?: string;
  status?: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  progress?: number;
}

interface UploadHistory {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'completed' | 'failed';
  timestamp: number;
}

const CHUNK_SIZE = 1024 * 1024; // 1MB
const MAX_FILES = 10;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const UploadManager: React.FC = () => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploadHistory, setUploadHistory] = useState<UploadHistory[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
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
      const isValidSize = file.size <= MAX_FILE_SIZE;
      return isValidType && isValidSize;
    });

    const newFiles = validFiles.map(file => ({
      ...file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      status: 'pending' as const,
      progress: 0,
    }));

    setFiles(prev => {
      const updatedFiles = [...prev, ...newFiles];
      return updatedFiles.slice(0, MAX_FILES);
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif'],
      'video/*': ['.mp4', '.webm'],
    },
    maxSize: MAX_FILE_SIZE,
    maxFiles: MAX_FILES,
  });

  const uploadMutation = useMutation(
    async (file: FileWithPreview) => {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      
      // Initialize upload
      const { data: { uploadId } } = await axios.post('/api/upload/init', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        totalChunks,
      });

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkIndex', i.toString());
        formData.append('totalChunks', totalChunks.toString());

        await axios.post(`/api/upload/chunk/${uploadId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const progress = ((i + 1) / totalChunks) * 100;
        setFiles(prev => prev.map(f => 
          f === file ? { ...f, progress } : f
        ));
      }

      // Complete upload
      const { data: fileInfo } = await axios.post(`/api/upload/complete/${uploadId}`, {
        checksum: await calculateChecksum(file),
      });

      return fileInfo;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('uploads');
      },
    }
  );

  const handleUpload = async (file: FileWithPreview) => {
    try {
      setFiles(prev => prev.map(f => 
        f === file ? { ...f, status: 'uploading' } : f
      ));
      await uploadMutation.mutateAsync(file);
      setFiles(prev => prev.map(f => 
        f === file ? { ...f, status: 'completed' } : f
      ));
      
      // Add to upload history
      updateUploadHistory({
        id: file.uploadId || Date.now().toString(),
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        status: 'completed',
        timestamp: Date.now()
      });
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f === file ? { ...f, status: 'error' } : f
      ));
      
      // Add failed upload to history
      updateUploadHistory({
        id: file.uploadId || Date.now().toString(),
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        status: 'failed',
        timestamp: Date.now()
      });
    }
  };

  const handlePause = (file: FileWithPreview) => {
    setFiles(prev => prev.map(f => 
      f === file ? { ...f, status: 'paused' } : f
    ));
  };

  const handleResume = (file: FileWithPreview) => {
    setFiles(prev => prev.map(f => 
      f === file ? { ...f, status: 'uploading' } : f
    ));
    handleUpload(file);
  };

  const handleRemove = (file: FileWithPreview) => {
    setFiles(prev => prev.filter(f => f !== file));
    if (file.preview) {
      URL.revokeObjectURL(file.preview);
    }
  };

  const calculateChecksum = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('MD5', buffer);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
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
              Maximum file size: 100MB
              <br />
              Maximum files: 10
            </Typography>
          </Box>

          <List sx={{ mt: 2 }}>
            {files.map((file, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  <Box>
                    {file.status === 'uploading' && (
                      <IconButton onClick={() => handlePause(file)}>
                        <PauseIcon />
                      </IconButton>
                    )}
                    {file.status === 'paused' && (
                      <IconButton onClick={() => handleResume(file)}>
                        <PlayArrowIcon />
                      </IconButton>
                    )}
                    <IconButton onClick={() => handleRemove(file)}>
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemIcon>
                  {file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      style={{ width: 40, height: 40, objectFit: 'cover' }}
                    />
                  ) : (
                    <CloudUploadIcon />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={file.name}
                  secondary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        {file.status}
                      </Typography>
                      {file.status === 'uploading' && (
                        <CircularProgress
                          size={16}
                          value={file.progress}
                          variant="determinate"
                        />
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={() => files.forEach(handleUpload)}
              disabled={files.length === 0 || files.every(f => f.status === 'completed')}
            >
              Upload All
            </Button>
          </Box>

          {/* Upload History Section */}
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Upload History
            </Typography>
            <List>
              {uploadHistory.map((item) => (
                <ListItem key={item.id}>
                  <ListItemIcon>
                    {item.status === 'completed' ? 
                      <CheckCircleIcon color="success" /> : 
                      <ErrorIcon color="error" />
                    }
                  </ListItemIcon>
                  <ListItemText
                    primary={item.fileName}
                    secondary={`${new Date(item.timestamp).toLocaleString()} - ${(item.fileSize / 1024 / 1024).toFixed(2)} MB`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}; 