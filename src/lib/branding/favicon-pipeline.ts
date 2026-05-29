// Client-side favicon auto-resize pipeline.
// Takes a source image File, resizes via <canvas> to multiple sizes,
// returns Blobs ready to upload.

export type FaviconSize = 32 | 180 | 512;

export const FAVICON_SIZES: FaviconSize[] = [32, 180, 512];

export async function resizeImageToBlob(
  file: File,
  size: number,
  mime = "image/png",
): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Fit cover (square crop)
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const srcSize = Math.min(srcW, srcH);
  const sx = (srcW - srcSize) / 2;
  const sy = (srcH - srcSize) / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bitmap, sx, sy, srcSize, srcSize, 0, 0, size, size);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      mime,
      0.95,
    );
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to HTMLImageElement
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export async function generateFaviconSet(
  file: File,
): Promise<Record<FaviconSize, Blob>> {
  const out = {} as Record<FaviconSize, Blob>;
  for (const size of FAVICON_SIZES) {
    out[size] = await resizeImageToBlob(file, size, "image/png");
  }
  return out;
}
