/** Client-side image handling: decode, downscale and re-encode screenshots before storage/AI. */

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function decode(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file could not be read as an image. Try a PNG or JPEG screenshot.'));
    };
    img.src = url;
  });
}

/** Downscale to `maxSide` on the long edge and encode as JPEG (keeps chart text legible at 2000px). */
export async function prepareImage(file: Blob, maxSide = 2000, quality = 0.88): Promise<PreparedImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image is larger than 25 MB.');
  const img = await decode(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))), 'image/jpeg', quality),
  );
  return { blob, width: w, height: h, mime: 'image/jpeg' };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
