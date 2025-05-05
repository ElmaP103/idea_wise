import { DocumentPickerAsset } from 'expo-document-picker';

export function validateFiles(files: DocumentPickerAsset[]) {
  if (files.length < 1 || files.length > 10) {
    return { valid: false, error: 'Select 1-10 files.' };
  }
  for (const file of files) {
    if (!file.mimeType?.startsWith('image') && !file.mimeType?.startsWith('video')) {
      return { valid: false, error: 'Only images and videos allowed.' };
    }
    if (file.size && file.size > 2 * 1024 * 1024 * 1024) {
      return { valid: false, error: 'File too large (max 2GB).' };
    }
  }
  return { valid: true, error: null };
}
