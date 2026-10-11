// Client-side photo preparation. The server accepts only PNG/JPEG/WebP up to
// 400 KB, so large camera photos are shrunk in the browser first (a typical
// phone photo is 3-8 MB). Output is a JPEG data URI.

export const MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_OUTPUT_CHARS = 540 * 1024; // ~400 KB once decoded from base64

// Pure helper (unit-tested): the size to scale (w, h) down to so that the
// longest side is at most `max`, never upscaling.
export function fitWithin(width, height, max = 900) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function validateImageFile(file) {
  if (!file) return 'No file selected';
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Please choose a JPEG, PNG or WebP photo';
  if (file.size > MAX_INPUT_BYTES) return 'That photo is too large (max 12 MB)';
  return null;
}

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
  img.src = url;
});

export async function prepareImageForUpload(file) {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);
  const img = await loadImage(file);
  for (const [max, quality] of [[900, 0.8], [700, 0.7], [520, 0.6]]) {
    const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    const dataUri = canvas.toDataURL('image/jpeg', quality);
    if (dataUri.length <= MAX_OUTPUT_CHARS) return dataUri;
  }
  throw new Error('Could not shrink that photo enough - try a smaller one');
}

// yyyy-mm-dd in the user's local time. (The old default,
// toLocaleDateString(), gave dd/mm/yyyy under en-IN, which the server could
// misread or reject: "25/10/2026" is not a valid date to JavaScript.)
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
