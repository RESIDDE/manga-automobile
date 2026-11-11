/** Long edge of a stored vehicle photo: sharp on a laptop screen, a fraction of a phone original. */
const MAX_EDGE = 1600;
/** WebP quality: the smallest files before blocking and smearing start to show on car paint. */
const QUALITY = 0.72;

/**
 * Shrinks a photo and re-encodes it as WebP before upload. Browsers that
 * can't encode WebP (Safari before 17) get a JPEG instead, which is still far
 * smaller than the original. If the photo can't be decoded at all, the
 * original file is returned untouched so the upload still goes through.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let blob = await toBlob(canvas, "image/webp", QUALITY);
    // Unsupported types silently come back as PNG, which would be bigger
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.75);
    if (!blob || blob.size >= file.size) return file;

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.${ext}`, { type: blob.type });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
