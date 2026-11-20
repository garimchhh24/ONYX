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

/** Read an image file/blob as a downscaled JPEG data URL (keeps the local DB small). */
export function imageToDataUrl(file: Blob, maxSide = 1800, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(String(reader.result));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
