# Media File Upload System

A cross-platform media file upload solution that supports both web and mobile platforms, with robust file handling capabilities.

## Project Structure

```
IDEAWISE/
├── frontend/          # React web application
├── backend/           # Node.js backend server
└── MediaUploadMobile_expo/   # React Native mobile application 

## Features

### Common Features (Web & Mobile)
- Multiple file selection (1-10 files)
- File type filtering (images and videos)
- Instant file validation
- Visual file preview
- Chunked upload (1MB chunks)
- Concurrency control (max 3 parallel uploads)
- Upload progress tracking
- Pause/Resume/Cancel operations
- Automatic retry mechanism

### Web-Specific Features
- Drag-and-drop upload
- Responsive layout
- Local storage for upload history

### Backend Features
- Chunk reception and reassembly
- File type validation
- Organized storage
- File deduplication
- Automatic cleanup
- Monitoring and logging

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Redis server
- React Native development environment (for mobile)

### Installation

1. Clone the repository:
   ```bash
   git clone MediaUploadMobile_expo
   cd IDEAWISE
   ```

2. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd ../frontend
   npm install
   ```

4. Start Redis server:
   ```bash
   redis-server
   ```

5. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

6. Start the frontend development server:
   ```bash
   cd frontend
   npm start
   ```

## Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

## API Documentation

### Upload Endpoints

#### Initialize Upload
```
POST /api/upload/init
```
Request body:
```json
{
  "fileName": "example.jpg",
  "fileSize": 1024000,
  "fileType": "image/jpeg",
  "totalChunks": 10
}
```

#### Upload Chunk
```
POST /api/upload/chunk/:uploadId
```
Request body (multipart/form-data):
- chunk: File chunk
- chunkIndex: Number
- totalChunks: Number

#### Complete Upload
```
POST /api/upload/complete/:uploadId
```
Request body:
```json
{
  "checksum": "md5-checksum"
}
```

#### Get Upload Status
```
GET /api/upload/status/:uploadId
```

 