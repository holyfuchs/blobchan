import { loadKZG as loadRaw } from 'kzg-wasm';
import { bytesToHex, hexToBytes, type Hex } from 'viem';

export type KzgApi = {
  blobToKzgCommitment(blob: Uint8Array): Uint8Array;
  computeBlobKzgProof(blob: Uint8Array, commitment: Uint8Array): Uint8Array;
};

/** EIP-4844 fixed sizes — a blob is exactly 4096 BLS field elements × 32 bytes.
 *  kzg-wasm rejects anything else with a bare `invalid argument`, so we check
 *  up front and surface a useful error instead. */
const BLOB_BYTES = 131072;
const COMMITMENT_BYTES = 48;

function describeBlob(b: Uint8Array): string {
  return `len=${b.length} (expected ${BLOB_BYTES}), byteLength=${b.byteLength}, offset=${b.byteOffset}, constructor=${b.constructor.name}`;
}

/** Validates that `b` is exactly the right shape for an EIP-4844 blob before
 *  handing it to kzg-wasm. Throws with a detailed message if not. */
function assertBlob(b: Uint8Array, ctx: string): void {
  if (!(b instanceof Uint8Array)) {
    throw new Error(`[kzg] ${ctx}: expected Uint8Array, got ${Object.prototype.toString.call(b)}`);
  }
  if (b.length !== BLOB_BYTES) {
    throw new Error(`[kzg] ${ctx}: blob has wrong size — ${describeBlob(b)}`);
  }
  // Sanity-check the hex conversion too, since kzg-wasm takes a hex string.
  const hex = bytesToHex(b);
  if (!hex.startsWith('0x') || hex.length !== 2 + BLOB_BYTES * 2) {
    throw new Error(`[kzg] ${ctx}: hex conversion wrong — got len=${hex.length}, prefix=${hex.slice(0, 4)} (expected 0x + ${BLOB_BYTES * 2} hex chars)`);
  }
}

function assertCommitment(c: Uint8Array, ctx: string): void {
  if (!(c instanceof Uint8Array)) {
    throw new Error(`[kzg] ${ctx}: commitment expected Uint8Array, got ${Object.prototype.toString.call(c)}`);
  }
  if (c.length !== COMMITMENT_BYTES) {
    throw new Error(`[kzg] ${ctx}: commitment has wrong size — len=${c.length} (expected ${COMMITMENT_BYTES})`);
  }
}

let _api: KzgApi | null = null;
let _loading: Promise<KzgApi> | null = null;

export async function loadKZG(): Promise<KzgApi> {
  if (_api) return _api;
  if (_loading) return _loading;
  _loading = (async () => {
    const raw = await loadRaw();
    _api = {
      blobToKzgCommitment(b: Uint8Array) {
        assertBlob(b, 'blobToKzgCommitment');
        const hex = bytesToHex(b);
        try {
          const result = raw.blobToKZGCommitment(hex);
          return hexToBytes(result as Hex);
        } catch(e: any) {
          console.error('[kzg] raw.blobToKZGCommitment threw:', e, '\n  input:', describeBlob(b), '\n  hex head:', hex.slice(0, 16), '…', 'hex tail:', '…' + hex.slice(-16));
          throw new Error(`[kzg] blobToKZGCommitment failed: ${e?.message || e}. Input OK (${describeBlob(b)}) — likely a kzg-wasm internal error.`, { cause: e });
        }
      },
      computeBlobKzgProof(b: Uint8Array, c: Uint8Array) {
        assertBlob(b, 'computeBlobKzgProof/blob');
        assertCommitment(c, 'computeBlobKzgProof/commitment');
        try {
          return hexToBytes(raw.computeBlobKZGProof(bytesToHex(b), bytesToHex(c)) as Hex);
        } catch(e: any) {
          console.error('[kzg] raw.computeBlobKZGProof threw:', e, '\n  blob:', describeBlob(b), '\n  commitment len:', c.length);
          throw new Error(`[kzg] computeBlobKZGProof failed: ${e?.message || e}`, { cause: e });
        }
      },
    };
    return _api;
  })();
  return _loading;
}
