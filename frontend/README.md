# Media Upload Frontend

A React-based frontend for the media file upload system.

## Features

- Drag and drop file upload
- Support for multiple file selection (up to 10 files)
- File type validation (images and videos)
- File size validation (max 100MB)
- Chunked upload with progress tracking
- Pause/Resume functionality
- Visual file preview
- Responsive design

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Testing

Run the test suite:
```bash
npm test
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
REACT_APP_API_URL=http://localhost:3000/api
```

## Technologies Used

- React
- TypeScript
- Material-UI
- React Query
- React Dropzone
- Axios

## Project Structure

```
src/
├── components/         # React components
├── hooks/             # Custom React hooks
├── services/          # API services
├── utils/             # Utility functions
├── App.tsx            # Main App component
└── index.tsx          # Entry point
```
