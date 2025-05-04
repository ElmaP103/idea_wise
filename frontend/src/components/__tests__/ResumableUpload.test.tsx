import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResumableUpload } from '../ResumableUpload';

describe('ResumableUpload', () => {
  const mockOnUploadComplete = jest.fn();
  const mockOnError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders file input button', () => {
    render(<ResumableUpload onUploadComplete={mockOnUploadComplete} onError={mockOnError} />);
    expect(screen.getByText('Select File')).toBeInTheDocument();
  });

  it('handles file selection', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    render(<ResumableUpload onUploadComplete={mockOnUploadComplete} onError={mockOnError} />);
    
    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/test.jpg/)).toBeInTheDocument();
    });
  });

  it('shows error message on upload failure', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    render(<ResumableUpload onUploadComplete={mockOnUploadComplete} onError={mockOnError} />);
    
    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled();
    });
  });

  it('shows progress during upload', async () => {
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    render(<ResumableUpload onUploadComplete={mockOnUploadComplete} onError={mockOnError} />);
    
    const input = screen.getByTestId('file-input');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });
}); 