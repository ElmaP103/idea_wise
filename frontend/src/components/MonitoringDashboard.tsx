import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
} from '@mui/material';
import { useQuery } from 'react-query';
import axios from 'axios';

interface UploadStats {
  totalUploads: number;
  activeUploads: number;
  failedUploads: number;
  totalSize: number;
  averageSpeed: number;
}

interface RecentUpload {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  timestamp: string;
  uploadSpeed: number;
}

const MonitoringDashboard: React.FC = () => {
  const [stats, setStats] = useState<UploadStats>({
    totalUploads: 0,
    activeUploads: 0,
    failedUploads: 0,
    totalSize: 0,
    averageSpeed: 0,
  });

  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([]);

  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery(
    'uploadStats',
    async () => {
      const response = await axios.get('/api/monitoring/stats');
      return response.data;
    },
    {
      refetchInterval: 30000,
      retry: 3,
      retryDelay: 5000,
    }
  );

  const { data: recentData, isLoading: recentLoading, error: recentError } = useQuery(
    'recentUploads',
    async () => {
      const response = await axios.get('/api/upload/recent');
      return response.data;
    },
    {
      refetchInterval: 30000,
      retry: 3,
      retryDelay: 5000,
    }
  );

  useEffect(() => {
    if (statsData) {
      setStats(statsData);

    }
  }, [statsData]);

  useEffect(() => {
    if (recentData) {
      setRecentUploads(recentData);
    }
  }, [recentData]);

  if (statsError || recentError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load monitoring data. Please check if the backend server is running.
        </Alert>
      </Box>
    );
  }

  if (statsLoading || recentLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Upload Monitoring Dashboard
      </Typography>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
        <div>
          <Card style={{ minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Uploads
              </Typography>
              <Typography variant="h4">{stats.totalUploads}</Typography>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card style={{ minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Uploads
              </Typography>
              <Typography variant="h4">{stats.activeUploads}</Typography>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card style={{ minHeight: 160, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Failed Uploads
              </Typography>
              <Typography variant="h4" color="error">
                {stats.failedUploads}
              </Typography>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card style={{ minHeight: 160
            , display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Average Speed
              </Typography>
              <Typography variant="h5">
                {isNaN(stats.averageSpeed) || !isFinite(stats.averageSpeed)
                  ? '0.00'
                  : stats.averageSpeed.toFixed(2)
                } MB/s
              </Typography>
            </CardContent>
          </Card>
        </div>
      </div>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Recent Uploads
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>File Name</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Speed</TableCell>
                <TableCell>Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentUploads.map((upload) => (
                <TableRow key={upload.id}>
                  <TableCell>{upload.fileName}</TableCell>
                  <TableCell>{(upload.fileSize / 1024 / 1024).toFixed(2)} MB</TableCell>
                  <TableCell>{upload.status}</TableCell>
                  <TableCell>
                    {isNaN(upload.uploadSpeed) || !isFinite(upload.uploadSpeed)
                      ? '0.00'
                      : upload.uploadSpeed.toFixed(2)
                    } MB/s
                  </TableCell>
                  <TableCell>{new Date(upload.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
};

export default MonitoringDashboard; 