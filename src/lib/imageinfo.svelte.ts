/** Reactive cache of image dimensions keyed by data URL. Dimensions are
 *  loaded async via a hidden `Image` and stored reactively so any template
 *  reading `imageInfo.dms[url]` updates once the load completes. */

let dms = $state<Record<string, { w: number; h: number }>>({});
const loading = new Set<string>();

export const imageInfo = {
  get dms() { return dms; }
};

/** Kick off an async image load to populate dimensions and return the
 *  currently-cached value (undefined until the load completes). Idempotent —
 *  safe to call repeatedly in a template; subsequent calls are no-ops once
 *  loading has started. The reactive `dms` map updates once loaded, so the
 *  template re-renders with real dimensions. */
export function loadDims(url: string): { w: number; h: number } | undefined {
  if (!dms[url] && !loading.has(url)) {
    loading.add(url);
    const img = new Image();
    img.onload = () => {
      dms = { ...dms, [url]: { w: img.width, h: img.height } };
      loading.delete(url);
    };
    img.onerror = () => { loading.delete(url); };
    img.src = url;
  }
  return dms[url];
}

/** Decoded byte size of a `data:...;base64,XXXX` URL. */
export function dataSize(dataUrl: string): number {
  const b64 = dataUrl.split(',')[1] || '';
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor(b64.length * 3 / 4) - padding;
}

/** Human-readable file size, e.g. `38 KB`, `1.2 MB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** File extension for a MIME type, e.g. `image/webp` → `webp`. Falls back to
 *  `webp` for unknown/missing types (matches the blobchan default). */
export function mimeExt(mime?: string): string {
  if (!mime) return 'webp';
  const m = /^image\/(.+)$/.exec(mime);
  return m?.[1] || 'webp';
}
