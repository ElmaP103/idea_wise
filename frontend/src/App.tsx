import React, { useState } from 'react';
import { Container, Box, Typography, Snackbar, Alert } from '@mui/material';
import { UploadManager } from './components/UploadManager';
import MonitoringDashboard from './components/MonitoringDashboard';
import { logger } from './utils/logger';

type ErrorCategory = 'NETWORK' | 'VALIDATION' | 'SERVER' | 'PERMISSION' | 'UNKNOWN';

interface UploadError {
  message: string;
  category: ErrorCategory;
  details?: string;
}

function App() {
  const [error, setError] = useState<UploadError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUploadComplete = (uploadIds: string[]) => {
    if (uploadIds.length === 1) {
      setSuccess(`File uploaded successfully! ID: ${uploadIds[0]}`);
    } else {
      setSuccess(`${uploadIds.length} files uploaded successfully!`);
    }
    uploadIds.forEach(uploadId => {
      logger.info('Upload completed:', uploadId);
    });
  };

  const handleUploadError = (error: UploadError) => {
    setError(error);
  };

  const handleCloseSnackbar = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          File Upload System
        </Typography>

        <Box sx={{ mb: 4 }}>
          <UploadManager
            onUploadComplete={handleUploadComplete}
            onError={handleUploadError}
          />
        </Box>

        <Box sx={{ mb: 4 }}>
          <MonitoringDashboard />
        </Box>

        <Snackbar
          open={!!error}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
        >
          <Alert severity="error" onClose={handleCloseSnackbar}>
            <Typography variant="subtitle2">{error?.category}</Typography>
            <Typography>{error?.message}</Typography>
            {error?.details && (
              <Typography variant="caption" display="block">
                {error.details}
              </Typography>
            )}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!success}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
        >
          <Alert severity="success" onClose={handleCloseSnackbar}>
            <Typography>{success}</Typography>
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
}

export default App;
