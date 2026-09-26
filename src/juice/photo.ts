/** Photo mode helpers (PRD 9.8): composite the name label and download the PNG. */

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("photo decode failed"));
    img.src = url;
  });
}

/** Draws the render plus a cute cream label (pet name, island name) in the bottom-left corner. */
export async function composePhoto(dataUrl: string, petName: string, islandName: string, accent: string): Promise<Blob> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("no 2d context");
  g.drawImage(img, 0, 0);
  const s = Math.max(0.6, img.height / 800);
  const pad = 18 * s;
  const titleFont = `600 ${Math.round(30 * s)}px Fredoka, Nunito, sans-serif`;
  const subFont = `700 ${Math.round(15 * s)}px Nunito, Fredoka, sans-serif`;
  g.font = titleFont;
  const w1 = g.measureText(petName).width;
  g.font = subFont;
  const w2 = g.measureText(islandName).width;
  const w = Math.max(w1, w2) + pad * 2 + 10 * s;
  const h = 78 * s;
  const x = 22 * s;
  const y = img.height - h - 22 * s;
  g.fillStyle = "rgba(91, 70, 54, 0.18)";
  roundRect(g, x, y + 5 * s, w, h, 20 * s);
  g.fill();
  g.fillStyle = "#fff8ea";
  roundRect(g, x, y, w, h, 20 * s);
  g.fill();
  g.fillStyle = accent;
  roundRect(g, x + 10 * s, y + 14 * s, 6 * s, h - 28 * s, 3 * s);
  g.fill();
  g.fillStyle = "#5b4636";
  g.textBaseline = "alphabetic";
  g.font = titleFont;
  g.fillText(petName, x + pad + 10 * s, y + 38 * s);
  g.fillStyle = "#8a7260";
  g.font = subFont;
  g.fillText(islandName, x + pad + 10 * s, y + 62 * s);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function photoFilename(petName: string, seed: number): string {
  const safe = petName.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "pet";
  return `${safe}-island-${seed}.png`;
}

/** Species accent color (section 8): dog peach, cat lilac, rabbit and rodent mint. */
export function speciesAccent(species: string): string {
  if (species === "dog") return "#ffc9a8";
  if (species === "cat") return "#d9c8f5";
  return "#bfeccf";
}
