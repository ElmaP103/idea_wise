import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { UploadManager } from '../UploadManager';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

describe('UploadManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders upload manager component', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <UploadManager />
      </QueryClientProvider>
    );

    expect(screen.getByText('Drag and drop files here, or click to select files')).toBeInTheDocument();
  });

  it('handles file selection', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const data = { data: { uploadId: '123' } };

    mockedAxios.post.mockResolvedValueOnce(data);

    render(
      <QueryClientProvider client={queryClient}>
        <UploadManager />
      </QueryClientProvider>
    );

    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.jpg')).toBeInTheDocument();
    });
  });

  it('handles upload error', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const error = new Error('Upload failed');

    mockedAxios.post.mockRejectedValueOnce(error);

    render(
      <QueryClientProvider client={queryClient}>
        <UploadManager />
      </QueryClientProvider>
    );

    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('error')).toBeInTheDocument();
    });
  });
}); 