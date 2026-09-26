/** Client-side photo handling: decode, resize to 1024 px JPEG, and measure the main coat color. */

export const MAX_SIDE = 1024;
const ACCEPTED = /^image\/(jpeg|png|webp|gif|heic|heif|avif|bmp)$/i;

export interface PreparedPhoto {
  /** "data:image/jpeg;base64,..." for the preview. */
  dataUrl: string;
  /** Raw base64 JPEG for the API. */
  base64: string;
  /** Rough coat color measured from the center of the photo, for the offline fallback pet. */
  measuredColor: string;
}

export class PhotoError extends Error {}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to <img>, which some browsers can decode when createImageBitmap cannot.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Median color of the central region, sampled on a small canvas. Pets are usually centered, so
 * this is a decent guess at the coat when Claude is unavailable ("measured from it").
 */
function measureCenter(source: CanvasImageSource, w: number, h: number): string {
  const n = 24;
  const c = document.createElement("canvas");
  c.width = n;
  c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#e0a86a";
  ctx.drawImage(source, w * 0.3, h * 0.3, w * 0.4, h * 0.4, 0, 0, n, n);
  const px = ctx.getImageData(0, 0, n, n).data;
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < px.length; i += 4) {
    rs.push(px[i]);
    gs.push(px[i + 1]);
    bs.push(px[i + 2]);
  }
  const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
  return toHex(med(rs), med(gs), med(bs));
}

/** Decodes any image the browser can read and re-encodes it as a JPEG no larger than 1024 px. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.type && !ACCEPTED.test(file.type)) {
    throw new PhotoError("That does not look like a photo. Try a JPEG, PNG, or WebP.");
  }
  let img: ImageBitmap | HTMLImageElement;
  try {
    img = await decode(file);
  } catch {
    throw new PhotoError("This browser cannot open that photo. Try a JPEG or PNG version.");
  }
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("Could not read that photo.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const measuredColor = measureCenter(img, w, h);
  if ("close" in img) img.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1), measuredColor };
}
