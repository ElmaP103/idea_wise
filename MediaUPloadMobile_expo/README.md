# MediaUploadMobile_expo

A React Native (Expo) mobile app for uploading large images and videos with chunked, resumable, and concurrent upload support.

## Features
- **Chunked Uploads:** Upload large files in chunks (default: 1MB, configurable)
- **Resumable Uploads:** Pause, resume, and cancel uploads
- **Concurrent Uploads:** Upload up to 3 files at once
- **Progress Tracking:** See per-file progress and speed
- **File Validation:** Supports images and videos, up to 2GB per file
- **Modern UI:** Clean, mobile-friendly interface
- **Error Handling:** Retry on network errors, clear error messages

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A backend server that supports chunked uploads (see `/api/upload/chunk`, `/api/upload/init`, etc.)

### Installation
```bash
# Clone the repo
git clone https://github.com/ElmaP103/idea_wise
cd MediaUploadMobile_expo

# Install dependencies
npm install
# or
yarn install
```

### Running the App
```bash
# Start the Expo development server
npx expo start

```
- Scan the QR code with the Expo Go app on your device, or run on an emulator.

## Usage
1. **Choose Images or Videos:** Tap the button to select up to 10 files (images/videos, max 2GB each).
2. **Take Photo/Record Video:** Use the camera to capture new media.
3. **Start Upload:** Tap the START UPLOAD button to begin uploading.
4. **Pause/Resume/Cancel:** Use the controls on each upload item to pause, resume, or cancel uploads.
5. **Monitor Progress:** See progress bars and speed for each file.

## Configuration
- **Chunk Size:**
  - Edit `CHUNK_SIZE` in `src/components/UploadItem.tsx` (default: 1MB)
- **Max File Size:**
  - Edit validation in `src/utils/validation.ts` and `src/components/FilePicker.tsx` (default: 2GB)
- **Concurrent Uploads:**
  - Edit logic in `src/components/UploadManager.tsx` (default: 3)

## File Structure
```
MediaUploadMobile_expo/
├── app/
│   └── index.tsx           # App entry, manages files state
├── src/
│   ├── components/
│   │   ├── FilePicker.tsx  # File/camera picker UI
│   │   ├── UploadManager.tsx # Upload list and controls
│   │   ├── UploadItem.tsx  # Per-file upload logic and UI
│   │   └── FilePreview.tsx # File preview UI
│   └── utils/
│       ├── validation.ts   # File validation logic
│       └── upload.ts       # (Stub) upload logic
├── package.json
├── README.md
└── ...
```

## Backend API Requirements
Your backend must support:
- `POST /api/upload/init` — initialize upload, returns `uploadId`
- `POST /api/upload/chunk/:uploadId` — upload a chunk
- `POST /api/upload/complete/:uploadId` — complete upload
- `GET /api/upload/status/:uploadId` — check upload status
- `PATCH /api/upload/:uploadId/speed` — update upload speed
- `DELETE /api/upload/:uploadId` — cancel/delete upload

See the backend folder in your repo for a sample implementation.

## Troubleshooting
- **Button not clickable or overlapped:** Ensure ScrollView and button are in separate containers, and use proper margins.
- **Large files not uploading:** Check backend limits, device memory, and chunk size.
- **Cancel not working:** Make sure parent passes `onRemoveFile` prop and manages files state.
- **UI not updating:** Check that state is lifted to the parent and passed as props.

## Customization
- Change colors, styles, and layout in the component files.
- Adjust chunk size, max file size, and concurrency as needed.


