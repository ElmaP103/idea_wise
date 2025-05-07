# MediaUploadMobile_expo

A React Native (Expo) mobile app for selecting, recording, previewing, and uploading images and videos with resumable upload support.

## Features
- **Pick images or videos** from the device library (multiple selection supported)
- **Capture photos or record videos** using the device camera
- **Video preview** with Save/Delete/Cancel options before upload
- **Upload queue** with resumable, concurrent uploads (up to 3 at a time)
- **Progress tracking** for each file and overall
- **Spinner/loading indicator** while picking large files or uploading
- **Robust permission handling** for camera, microphone, and media library
- **Error handling** for large files, unsupported types, and permission issues

## Getting Started

### 1. Install dependencies

```sh
npm install
```

### 2. Start the Expo development server

```sh
npx expo start
```

### 3. Run on your device or emulator

- Use the Expo Go app (Android/iOS) or an emulator/simulator.

## Usage
- **Choose Images or Videos:**  
  Tap "CHOOSE IMAGES OR VIDEOS" to select files from your library.
- **Take Photo or Record Video:**  
  Tap "TAKE PHOTO" or toggle to "RECORD VIDEO" and tap to capture.
- **Preview Video:**  
  After recording, preview the video and choose to Save, Delete, or Cancel.
- **Upload:**  
  Tap "START UPLOAD" to begin uploading files. Progress is shown for each file.
- **Remove File:**  
  Remove files from the upload list as needed.

## Permissions
The app requests the following permissions:
- Camera
- Microphone (for video recording)
- Media Library

These are handled automatically, but you may need to accept prompts on your device.

## Configuration
**app.json** includes the necessary Expo plugins for camera and permissions:

```json
"plugins": [
  [
    "expo-camera",
    {
      "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera",
      "microphonePermission": "Allow $(PRODUCT_NAME) to access your microphone",
      "recordAudioAndroid": true
    }
  ]
]
```

## Troubleshooting
- If you encounter issues with camera or permissions, ensure you have accepted all permission prompts.
- If the upload button is disabled after uploading, try adding new files; the button will re-enable.
- For large files, a spinner is shown while files are being picked or processed.

## File Structure
- `src/components/FilePicker.tsx` — Handles file picking, camera, and video preview
- `src/components/UploadManager.tsx` — Manages upload queue, progress, and upload button
- `src/components/UploadItem.tsx` — Displays individual file upload progress
- `app/index.tsx` — Main app entry, manages file state and layout

## Development Notes
- Built with Expo SDK 53+, React Native 0.79+, and expo-camera 16+
- Uses functional components and React hooks
- Designed for extensibility and easy integration with backend upload APIs



