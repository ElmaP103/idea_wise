import React, { useState } from 'react';
import { Container, Box, Typography, Snackbar, Alert } from '@mui/material';
import { ResumableUpload } from './components/ResumableUpload';
import MonitoringDashboard from './components/MonitoringDashboard';
import { logger } from './utils/logger';

function App() {
  const [error, setError] = useState<string | null>(null);
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

  const handleUploadError = (error: string) => {
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
          <ResumableUpload
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
            <span>{error || ''}</span>
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!success}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
        >
          <Alert severity="success" onClose={handleCloseSnackbar}>
            <span>{success || ''}</span>
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
}

export default App;
