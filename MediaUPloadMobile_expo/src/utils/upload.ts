// This is a stub. You will need to implement chunked upload, concurrency, pause/resume, etc.
export async function uploadFiles(setProgress: (p: number[]) => void) {
  // Simulate upload for 3 files
  let progress = [0, 0, 0];
  setProgress([...progress]);
  for (let i = 0; i < 100; i++) {
    await new Promise(res => setTimeout(res, 50));
    progress = progress.map(p => Math.min(1, p + 0.01));
    setProgress([...progress]);
  }
}
