import {
  type WalletClient, type Transport, type Chain, type Account,
  type Hex, parseGwei, bytesToHex, createPublicClient, http,
} from 'viem';
import { BLOBCHAN_MARKER, ETHERSCAN_API_KEY, type ChainConfig } from './config';
import type { Post, Thread } from './types';

// EIP-4844 blobs are 4096 BLS12-381 field elements, each 32 bytes. Each element
// must be < the field modulus p (a 254-bit prime, top byte 0x73). Arbitrary
// bytes — like JSON containing `{` (0x7b) — can exceed p and make kzg-wasm
// throw "invalid argument". To guarantee validity we use only the lower 31
// bytes of each 32-byte element, keeping the top byte 0. This caps any element
// at 2^248 - 1, safely below p ≈ 2^254.86.
const FIELD_ELEMENTS = 4096;
const BYTES_PER_ELEMENT = 32;
const USABLE_BYTES_PER_ELEMENT = 31;
const BLOB_SIZE = FIELD_ELEMENTS * BYTES_PER_ELEMENT;       // 131072 — on-wire blob size
const USABLE_BYTES = FIELD_ELEMENTS * USABLE_BYTES_PER_ELEMENT; // 126976 — payload capacity
const HEADER_SIZE = 2048; // max JSON header in payload bytes
const IMG_START = HEADER_SIZE;

/** Gas settings for EIP-4844 blob transactions. The MAX_* constants are
 *  fallbacks used when we can't fetch current base fees — in normal operation
 *  `sendBlobPost` fetches live base fees and sets caps with a 2× margin so the
 *  wallet's balance check doesn't require the user to hold 100× the actual cost. */
const MAX_FEE_PER_GAS_GWEI = 50n;
const MAX_PRIORITY_FEE_PER_GAS_GWEI = 2n;
const MAX_FEE_PER_BLOB_GAS_GWEI = 30n;
const BLOB_GAS_PER_BLOB = 131072n; // 2^17, fixed by EIP-4845
const ESTIMATED_EXEC_GAS = 21000n; // plain send to an EOA, no calldata
/** Multiplier applied to current base fees when setting max-fee caps. 2× gives
 *  headroom for short-term fee spikes without requiring a huge balance. */
const FEE_MARGIN_MULTIPLIER = 2n;
/** Hard floors for max-fee caps so we don't underprice in edge cases (e.g. an
 *  RPC that reports 0 base fee). In gwei. */
const MIN_MAX_FEE_PER_GAS_GWEI = 5n;
const MIN_MAX_FEE_PER_BLOB_GAS_GWEI = 2n;

/** Maximum UTF-8 byte size of the serialized post JSON (including the `BLOBCHAN:` marker). */
export const POST_HEADER_LIMIT = HEADER_SIZE;

/** Maximum raw binary image bytes that fit in the blob's image region. */
export const MAX_IMAGE_BYTES = USABLE_BYTES - IMG_START;

/** Encode a payload (≤ USABLE_BYTES) into a full 131072-byte blob by placing
 *  each 31-byte chunk into the lower 31 bytes of a 32-byte field element,
 *  with the top byte set to 0. Guarantees every element is a valid BLS field
 *  element (< p), which kzg-wasm requires. */
function encodeBlob(payload: Uint8Array): Uint8Array {
  if (payload.length > USABLE_BYTES) throw new Error(`Payload too large (${payload.length}/${USABLE_BYTES} bytes)`);
  const blob = new Uint8Array(BLOB_SIZE);
  const chunks = Math.ceil(payload.length / USABLE_BYTES_PER_ELEMENT);
  for (let i = 0; i < chunks; i++) {
    const srcStart = i * USABLE_BYTES_PER_ELEMENT;
    const srcEnd = Math.min(srcStart + USABLE_BYTES_PER_ELEMENT, payload.length);
    blob.set(payload.subarray(srcStart, srcEnd), i * BYTES_PER_ELEMENT + 1);
  }
  return blob;
}

/** Reverse of encodeBlob: extract the 31 usable bytes from each 32-byte
 *  field element (dropping the top byte, which should be 0). */
function decodeBlob(blob: Uint8Array): Uint8Array {
  const payload = new Uint8Array(USABLE_BYTES);
  for (let i = 0; i < FIELD_ELEMENTS; i++) {
    payload.set(blob.subarray(i * BYTES_PER_ELEMENT + 1, i * BYTES_PER_ELEMENT + BYTES_PER_ELEMENT), i * USABLE_BYTES_PER_ELEMENT);
  }
  return payload;
}

/**
 * Computes the UTF-8 byte length the post header will occupy inside the blob,
 * using the same serialization as `packBlob`. Use this in the UI to validate
 * before submitting, so the user gets a friendly error instead of a thrown one.
 *
 * Note: `packBlob` adds an `imageLen` field to the JSON when an image is
 * present. We account for that here so the check matches the actual serialized
 * size (worst case: `,"imageLen":124928` = 16 bytes).
 */
export function postHeaderBytes(post: Omit<Post, 'id' | 'blockNumber' | 'image'>, hasImage = false): number {
  const p = hasImage ? { ...post, imageLen: 0 } : post;
  const json = BLOBCHAN_MARKER + JSON.stringify(p);
  // +16 bytes worst case for the imageLen value (up to 6 digits)
  return new TextEncoder().encode(json).length + (hasImage ? 16 : 0);
}

function packBlob(post: Omit<Post, 'id' | 'blockNumber' | 'image'>, imageBytes?: Uint8Array): Uint8Array {
  // Store the image byte length in the JSON header so the reader can extract
  // exactly that many bytes — binary image data contains 0x00 bytes naturally,
  // so we can't rely on a zero terminator like the old hex format did.
  const postWithLen = imageBytes ? { ...post, imageLen: imageBytes.length } : post;
  const json = BLOBCHAN_MARKER + JSON.stringify(postWithLen);
  const jsonBytes = new TextEncoder().encode(json);
  if (jsonBytes.length > HEADER_SIZE) throw new Error(`Post text too long (${jsonBytes.length}/${HEADER_SIZE} bytes)`);
  const payload = new Uint8Array(USABLE_BYTES);
  payload.set(jsonBytes, 0);
  if (imageBytes) {
    const maxImgBytes = USABLE_BYTES - IMG_START;
    if (imageBytes.length > maxImgBytes) throw new Error(`Image too large (${imageBytes.length}/${maxImgBytes} bytes)`);
    payload.set(imageBytes, IMG_START);
  }
  const blob = encodeBlob(payload);
  if (blob.length !== BLOB_SIZE) throw new Error(`packBlob: internal error — blob is ${blob.length} bytes, expected ${BLOB_SIZE}`);
  return blob;
}

export function deserializePost(data: Uint8Array, txHash: string, blockNumber?: number): Post | null {
  try {
    // Detect encoding: new format has 0x00 at offset 0 (top byte of first field
    // element) followed by 'B' (0x42, start of BLOBCHAN:). Old format starts
    // with 'B' directly at offset 0. This lets us read legacy posts on-chain.
    const isNewFormat = data[0] === 0x00;
    const payload = isNewFormat ? decodeBlob(data) : data;

    let jsonEnd = payload.indexOf(0, 0);
    if (jsonEnd === -1 || jsonEnd > HEADER_SIZE) jsonEnd = HEADER_SIZE;
    const raw = new TextDecoder().decode(payload.slice(0, jsonEnd));
    if (!raw.startsWith(BLOBCHAN_MARKER)) return null;
    const p = JSON.parse(raw.slice(BLOBCHAN_MARKER.length)) as any;

    if (isNewFormat) {
      // New format: raw binary image bytes, length from the JSON header's
      // `imageLen` field. We can't scan for a zero byte because binary image
      // data contains 0x00 naturally. Falls back to zero-terminator scan for
      // posts written before the imageLen field was added.
      const imgLen = typeof p.imageLen === 'number' ? p.imageLen : -1;
      let imgBytes: Uint8Array;
      if (imgLen >= 0) {
        imgBytes = payload.slice(IMG_START, IMG_START + imgLen);
      } else {
        let imgEnd = IMG_START;
        const limit = Math.min(payload.length, USABLE_BYTES);
        while (imgEnd < limit && payload[imgEnd] !== 0) imgEnd++;
        imgBytes = payload.slice(IMG_START, imgEnd);
      }
      const image = imgBytes.length > 0 ? bytesToDataUrl(imgBytes, p.imageMime) : (p.image || undefined);
      // Don't expose imageLen on the Post — it's a serialization detail.
      const { imageLen, ...rest } = p;
      return { ...rest, id: txHash.replace('0x', ''), threadId: (p.threadId || txHash).replace('0x', ''), blockNumber, image, timestamp: p.timestamp || Math.floor(Date.now() / 1000) };
    } else {
      // Old format: hex-encoded image string from IMG_START to first zero byte.
      let imgHex = '';
      for (let i = IMG_START; i < BLOB_SIZE && data[i] !== 0; i++) imgHex += String.fromCharCode(data[i]);
      const image = imgHex.length > 0 ? hexToDataUrl(imgHex, p.imageMime) : (p.image || undefined);
      return { ...p, id: txHash.replace('0x', ''), threadId: (p.threadId || txHash).replace('0x', ''), blockNumber, image, timestamp: p.timestamp || Math.floor(Date.now() / 1000) };
    }
  } catch { return null; }
}

function hexToDataUrl(hex: string, mime: string = 'image/webp'): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytesToDataUrl(bytes, mime);
}

function bytesToDataUrl(bytes: Uint8Array, mime: string = 'image/webp'): string {
  let b = ''; for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(b)}`;
}

function dataUrlToBytes(u: string): Uint8Array {
  const b64 = u.split(',')[1] || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function sendBlobPost(args: {
  client: WalletClient<Transport, Chain, Account>;
  chain: ChainConfig;
  post: Omit<Post, 'id' | 'blockNumber' | 'image'>;
  imageDataUrl?: string;
  kzg: any;
}): Promise<string> {
  const { client, chain, post, imageDataUrl, kzg } = args;
  const blob = packBlob(post, imageDataUrl ? dataUrlToBytes(imageDataUrl) : undefined);
  // Final guard before handing the blob to viem → kzg-wasm. Catches any size
  // mismatch here with a clear message instead of a bare `invalid argument`
  // from inside WASM.
  if (blob.length !== BLOB_SIZE) throw new Error(`sendBlobPost: blob size ${blob.length} ≠ ${BLOB_SIZE}`);
  const blobHex = bytesToHex(blob) as Hex;
  if (!blobHex.startsWith('0x') || blobHex.length !== 2 + BLOB_SIZE * 2) {
    throw new Error(`sendBlobPost: blob hex malformed (len=${blobHex.length})`);
  }

  // Fetch current base fees and set max-fee caps with a 2× margin. This keeps
  // the wallet's balance check reasonable — using the hardcoded MAX_* constants
  // (50 gwei exec / 30 gwei blob) would require the user to hold ~0.005 ETH
  // even when actual fees are ~0.00004 ETH. With live base fees + 2× margin,
  // the required balance tracks reality.
  let maxFeePerGas = parseGwei(MAX_FEE_PER_GAS_GWEI.toString());
  let maxFeePerBlobGas = parseGwei(MAX_FEE_PER_BLOB_GAS_GWEI.toString());
  const priorityFee = parseGwei(MAX_PRIORITY_FEE_PER_GAS_GWEI.toString());
  try {
    const pubClient = createPublicClient({ chain: chain.viemChain, transport: http(chain.rpcUrl) });
    const [blobBaseFee, gasPrice] = await Promise.all([
      pubClient.getBlobBaseFee(),
      pubClient.getGasPrice(),
    ]);
    // maxFeePerGas = (base fee + priority fee) × margin, with a floor.
    const computedExec = (gasPrice + priorityFee) * FEE_MARGIN_MULTIPLIER;
    const minExec = parseGwei(MIN_MAX_FEE_PER_GAS_GWEI.toString());
    maxFeePerGas = computedExec > minExec ? computedExec : minExec;
    // maxFeePerBlobGas = blob base fee × margin, with a floor.
    const computedBlob = blobBaseFee * FEE_MARGIN_MULTIPLIER;
    const minBlob = parseGwei(MIN_MAX_FEE_PER_BLOB_GAS_GWEI.toString());
    maxFeePerBlobGas = computedBlob > minBlob ? computedBlob : minBlob;
  } catch {
    // Fall back to the hardcoded caps if the RPC can't provide base fees.
  }

  return await client.sendTransaction({
    to: chain.blobchanAddress, blobs: [blobHex], kzg, type: 'eip4844' as any,
    maxFeePerBlobGas, maxFeePerGas, maxPriorityFeePerGas: priorityFee, value: 0n,
  });
}

/** Estimates the realistic cost (in wei) of a single blob post on the given
 *  chain by querying the chain's current base fees. The max-fee caps in
 *  `sendBlobPost` are safety ceilings — the user actually pays the current
 *  base fee, which is typically far lower (e.g. ~0.3 gwei blob base fee on
 *  mainnet). Falls back to the max-fee estimate if the RPC can't provide base
 *  fees, so the UI never shows a stale or missing number. */
export async function estimatePostCost(chain: ChainConfig): Promise<bigint> {
  try {
    const client = createPublicClient({ chain: chain.viemChain, transport: http(chain.rpcUrl) });
    const [blobBaseFee, gasPrice] = await Promise.all([
      client.getBlobBaseFee(),
      client.getGasPrice(),
    ]);
    // Add the priority fee tip on top of the gas price for a realistic total.
    const totalGasPrice = gasPrice + MAX_PRIORITY_FEE_PER_GAS_GWEI * 1_000_000_000n;
    return ESTIMATED_EXEC_GAS * totalGasPrice + BLOB_GAS_PER_BLOB * blobBaseFee;
  } catch {
    // Fallback: use the max-fee caps (a safe overestimate) if the RPC doesn't
    // expose base fees. This is still a valid upper bound, just not tight.
    const execGas = ESTIMATED_EXEC_GAS * MAX_FEE_PER_GAS_GWEI * 1_000_000_000n; // wei
    const blobGas = BLOB_GAS_PER_BLOB * MAX_FEE_PER_BLOB_GAS_GWEI * 1_000_000_000n; // wei
    return execGas + blobGas;
  }
}

export function groupIntoThreads(posts: Post[]): Thread[] {
  const ops = posts.filter(p => p.threadId === p.id);
  return ops.map(op => ({ op, replies: posts.filter(p => p.threadId === op.id && p.id !== op.id).sort((a,b) => (a.timestamp||0)-(b.timestamp||0)) }));
}

async function rpc(rpcUrl: string, method: string, params: any[]) {
  const r = await fetch(rpcUrl, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:1,method,params}) });
  const d = await r.json(); if (d.error) throw new Error(d.error.message); return d.result;
}

async function beacon(beaconUrl: string, path: string) {
  const r = await fetch(beaconUrl + path, { headers: { 'Accept': 'application/json' } });
  const d = await r.json(); if (d.code) throw new Error(d.message); return d.data;
}

export async function fetchRemotePosts(
  chain: ChainConfig,
  cachedIds?: Set<string>,
  onPost?: (post: Post) => void,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ posts: Post[]; isFresh: boolean }> {
  const failedSlots = new Set<number>();
  try {
    const url = `${chain.etherscanBaseUrl}?chainid=${chain.etherscanChainId}&module=account&action=txlist&address=${chain.blobchanAddress}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const res = await fetch(url); const data = await res.json();
    if (data.status !== '1' || !data.result) return { posts: [], isFresh: false };

    const total = data.result.length;
    const posts: Post[] = []; let newPosts = 0; let skipped = 0; let processed = 0;
    for (const tx of data.result) {
      if (tx.to?.toLowerCase() !== chain.blobchanAddress.toLowerCase()) { processed++; onProgress?.(processed, total); continue; }
      if (cachedIds?.has(tx.hash.replace('0x',''))) { skipped++; processed++; onProgress?.(processed, total); continue; }
      try {
        const block = await rpc(chain.rpcUrl, 'eth_getBlockByHash', [tx.blockHash, false]);
        const pr = block.parentBeaconBlockRoot; if (!pr) { processed++; onProgress?.(processed, total); continue; }
        const ph = await beacon(chain.beaconUrl, '/eth/v1/beacon/headers/' + pr);
        const slot = parseInt(ph.header.message.slot) + 1;
        if (failedSlots.has(slot)) { skipped++; processed++; onProgress?.(processed, total); continue; }
        try {
          const scs = await beacon(chain.beaconUrl, '/eth/v1/beacon/blob_sidecars/' + slot);
          for (const sc of scs) {
            const hx = (sc.blob || '').replace('0x', '');
            const bs = new Uint8Array(hx.length / 2);
            for (let i = 0; i < bs.length; i++) bs[i] = parseInt(hx.slice(i * 2, i * 2 + 2), 16);
            const p = deserializePost(bs, tx.hash, parseInt(tx.blockNumber, 10));
            if (p) {
              // Fetch the tx receipt to get the actual gas cost (gasUsed ×
              // effectiveGasPrice + blobGasUsed × blobGasPrice). Stored as a
              // decimal string so it survives JSON serialization to IndexedDB.
              try {
                const receipt = await rpc(chain.rpcUrl, 'eth_getTransactionReceipt', [tx.hash]);
                if (receipt) {
                  const gasUsed = BigInt(receipt.gasUsed);
                  const effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
                  const blobGasUsed = receipt.blobGasUsed ? BigInt(receipt.blobGasUsed) : 0n;
                  const blobGasPrice = receipt.blobGasPrice ? BigInt(receipt.blobGasPrice) : 0n;
                  p.txCost = (gasUsed * effectiveGasPrice + blobGasUsed * blobGasPrice).toString();
                }
              } catch {}
              posts.push(p); newPosts++; onPost?.(p); break;
            }
          }
        } catch (e: any) {
          if (e?.message?.includes('404') || e?.message?.includes('NOT_FOUND')) failedSlots.add(slot);
        }
      } catch {}
      processed++;
      onProgress?.(processed, total);
    }
    console.log(`[blobchan:${chain.id}]`, newPosts, 'new +', skipped, 'cached');
    return { posts, isFresh: newPosts > 0 };
  } catch { return { posts: [], isFresh: false }; }
}
