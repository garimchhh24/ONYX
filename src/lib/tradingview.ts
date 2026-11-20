/**
 * TradingView snapshot links ("Copy link to the chart image", Alt+S) look like
 *   https://www.tradingview.com/x/AbCd1234/
 * and the underlying image lives at
 *   https://s3.tradingview.com/snapshots/a/AbCd1234.png
 * Converting the link lets the journal show the chart inline, no manual download.
 */
const SNAPSHOT_RE = /^https?:\/\/(?:[a-z]{2,3}\.|www\.)?tradingview\.com\/x\/([A-Za-z0-9]+)\/?/i;
const S3_RE = /^https?:\/\/s3\.tradingview\.com\/snapshots\/[a-z0-9]\/([A-Za-z0-9]+)\.png/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

export function snapshotId(url: string): string | undefined {
  const u = url.trim();
  return SNAPSHOT_RE.exec(u)?.[1] ?? S3_RE.exec(u)?.[1];
}

/** Direct image URL for a chart link, if it can be derived. */
export function chartImageUrl(url: string): string | undefined {
  const u = url.trim();
  if (!u) return undefined;
  const id = snapshotId(u);
  if (id) return `https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`;
  if (IMAGE_RE.test(u)) return u;
  return undefined;
}

export function isTradingViewUrl(url: string): boolean {
  return /tradingview\.com/i.test(url);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Downscaled JPEG blob — for upload to synced storage. */
export async function imageToBlob(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const canvas = drawScaled(await loadImage(file), maxSide);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
}

/** Downscaled JPEG data URL — for device-only storage. */
export async function imageToDataUrl(file: Blob, maxSide = 1400, quality = 0.78): Promise<string> {
  return drawScaled(await loadImage(file), maxSide).toDataURL('image/jpeg', quality);
}
