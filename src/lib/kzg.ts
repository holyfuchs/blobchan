import { loadKZG as loadRaw } from 'kzg-wasm';
import { bytesToHex, hexToBytes, type Hex } from 'viem';

export type KzgApi = {
  blobToKzgCommitment(blob: Uint8Array): Uint8Array;
  computeBlobKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array;
};

let _api: KzgApi | null = null;
let _loading: Promise<KzgApi> | null = null;

export async function loadKZG(): Promise<KzgApi> {
  if (_api) return _api;
  if (_loading) return _loading;
  _loading = (async () => {
    const raw = await loadRaw();
    _api = {
      blobToKzgCommitment(b: Uint8Array) {
        const hex = bytesToHex(b);
        try {
          const result = raw.blobToKZGCommitment(hex);
          return hexToBytes(result as Hex);
        } catch(e) {
          console.error('[kzg] raw.blobToKZGCommitment threw:', e);
          throw e;
        }
      },
      computeBlobKzgProof(b: Uint8Array, c: Uint8Array) {
        return hexToBytes(raw.computeBlobKZGProof(bytesToHex(b), bytesToHex(c)) as Hex);
      },
    };
    return _api;
  })();
  return _loading;
}
