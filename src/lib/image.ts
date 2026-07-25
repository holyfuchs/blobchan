/**
 * Reads an image file as a data URL, compressing/re-encoding to WebP when it's
 * large. Small files (<60KB raw) are passed through as-is to preserve quality.
 *
 * Animated WebP files are *always* passed through with original bytes, because
 * canvas re-encoding would flatten them to a single frame. A large animated
 * WebP that doesn't fit the blob image region will fail at `packBlob` time
 * with an `Image too large` error — the user can retry with a smaller file.
 *
 * The returned data URL is later hex-encoded into the image region of an
 * EIP-4844 blob (~129KB available) by `packBlob` in `blob.ts`.
 */
export async function processImage(file: File): Promise<string> {
  const animated = await isAnimatedWebp(file);
  if (file.size < 60000 || animated) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('Failed'));
      r.readAsDataURL(file);
    });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const maxW = 600;
      let w = img.width, h = img.height;
      if (w > maxW) { h = h * maxW / w; w = maxW; }
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      let q = 0.6;
      let u = c.toDataURL('image/webp', q);
      // Blob image region is 129024 hex bytes (~64.5KB binary, ~86KB base64).
      // 85000 chars leaves a small safety margin under that hard limit.
      while (u.length > 85000 && q > 0.15) { q -= 0.1; u = c.toDataURL('image/webp', q); }
      resolve(u);
    };
    img.onerror = () => reject(new Error('Failed'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Extracts the MIME type from a `data:` URL, e.g. `data:image/png;base64,...`
 * → `image/png`. Returns undefined for malformed inputs.
 */
export function dataUrlMime(dataUrl: string): string | undefined {
  const m = /^data:([^;]+);/.exec(dataUrl);
  return m?.[1];
}

/**
 * Detects whether a file is an animated WebP by inspecting the RIFF/VP8X
 * header. Animated WebPs always have a VP8X chunk with the animation flag set
 * as the first chunk after the WEBP signature.
 */
async function isAnimatedWebp(file: File): Promise<boolean> {
  // Fast path: if the browser tells us the type and it's not webp, skip.
  if (file.type && file.type !== 'image/webp') return false;
  try {
    const buf = await file.slice(0, 32).arrayBuffer();
    const b = new Uint8Array(buf);
    if (b.length < 21) return false;
    // "RIFF" at 0, "WEBP" at 8, "VP8X" at 12
    if (b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46) return false;
    if (b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50) return false;
    if (b[12] !== 0x56 || b[13] !== 0x50 || b[14] !== 0x38 || b[15] !== 0x58) return false;
    // VP8X flags are at offset 20; bit 1 (0x02) is the animation flag.
    return (b[20] & 0x02) !== 0;
  } catch {
    return false;
  }
}
