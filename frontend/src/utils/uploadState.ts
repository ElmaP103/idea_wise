export const getPersistedUploads = (): any[] => {
  const uploads: any[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('upload_')) {
      const state = localStorage.getItem(key);
      if (state) {
        uploads.push(JSON.parse(state));
      }
    }
  }
  return uploads;
};

export const saveUploadState = (uploadId: string, state: any) => {
  localStorage.setItem(`upload_${uploadId}`, JSON.stringify(state));
};

export const getUploadState = (uploadId: string) => {
  const state = localStorage.getItem(`upload_${uploadId}`);
  return state ? JSON.parse(state) : null;
};

export const clearUploadState = (uploadId: string) => {
  localStorage.removeItem(`upload_${uploadId}`);
};
