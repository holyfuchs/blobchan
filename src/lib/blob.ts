import {
  type WalletClient, type Transport, type Chain, type Account,
  type Hex, parseGwei, bytesToHex,
} from 'viem';
import { BLOBCHAN_MARKER, BLOBCHAN_ADDRESS, ETHERSCAN_API_KEY, RPC_URL, BEACON_URL } from './config';
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
const failedSlots = new Set<number>();

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
 */
export function postHeaderBytes(post: Omit<Post, 'id' | 'blockNumber' | 'image'>): number {
  const json = BLOBCHAN_MARKER + JSON.stringify(post);
  return new TextEncoder().encode(json).length;
}

function packBlob(post: Omit<Post, 'id' | 'blockNumber' | 'image'>, imageBytes?: Uint8Array): Uint8Array {
  const json = BLOBCHAN_MARKER + JSON.stringify(post);
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
      // New format: raw binary image bytes from IMG_START to first zero byte.
      let imgEnd = IMG_START;
      const limit = Math.min(payload.length, USABLE_BYTES);
      while (imgEnd < limit && payload[imgEnd] !== 0) imgEnd++;
      const imgBytes = payload.slice(IMG_START, imgEnd);
      const image = imgBytes.length > 0 ? bytesToDataUrl(imgBytes, p.imageMime) : (p.image || undefined);
      return { ...p, id: txHash.replace('0x', ''), threadId: (p.threadId || txHash).replace('0x', ''), blockNumber, image, timestamp: p.timestamp || Math.floor(Date.now() / 1000) };
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
  post: Omit<Post, 'id' | 'blockNumber' | 'image'>;
  imageDataUrl?: string;
  kzg: any;
}): Promise<string> {
  const { client, post, imageDataUrl, kzg } = args;
  const blob = packBlob(post, imageDataUrl ? dataUrlToBytes(imageDataUrl) : undefined);
  // Final guard before handing the blob to viem → kzg-wasm. Catches any size
  // mismatch here with a clear message instead of a bare `invalid argument`
  // from inside WASM.
  if (blob.length !== BLOB_SIZE) throw new Error(`sendBlobPost: blob size ${blob.length} ≠ ${BLOB_SIZE}`);
  const blobHex = bytesToHex(blob) as Hex;
  if (!blobHex.startsWith('0x') || blobHex.length !== 2 + BLOB_SIZE * 2) {
    throw new Error(`sendBlobPost: blob hex malformed (len=${blobHex.length})`);
  }
  return await client.sendTransaction({
    to: BLOBCHAN_ADDRESS, blobs: [blobHex], kzg, type: 'eip4844' as any,
    maxFeePerBlobGas: parseGwei('30'), maxFeePerGas: parseGwei('50'), maxPriorityFeePerGas: parseGwei('2'), value: 0n,
  });
}

export function groupIntoThreads(posts: Post[]): Thread[] {
  const ops = posts.filter(p => p.threadId === p.id);
  return ops.map(op => ({ op, replies: posts.filter(p => p.threadId === op.id && p.id !== op.id).sort((a,b) => (a.timestamp||0)-(b.timestamp||0)) }));
}

async function rpc(method: string, params: any[]) {
  const r = await fetch(RPC_URL, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:1,method,params}) });
  const d = await r.json(); if (d.error) throw new Error(d.error.message); return d.result;
}

async function beacon(path: string) {
  const r = await fetch(BEACON_URL + path, { headers: { 'Accept': 'application/json' } });
  const d = await r.json(); if (d.code) throw new Error(d.message); return d.data;
}

export async function fetchRemotePosts(cachedIds?: Set<string>): Promise<{ posts: Post[]; isFresh: boolean }> {
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=11155111&module=account&action=txlist&address=${BLOBCHAN_ADDRESS}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const res = await fetch(url); const data = await res.json();
    if (data.status !== '1' || !data.result) return { posts: [], isFresh: false };

    const posts: Post[] = []; let newPosts = 0; let skipped = 0;
    for (const tx of data.result) {
      if (tx.to?.toLowerCase() !== BLOBCHAN_ADDRESS.toLowerCase()) continue;
      if (cachedIds?.has(tx.hash.replace('0x',''))) { skipped++; continue; }
      try {
        const block = await rpc('eth_getBlockByHash', [tx.blockHash, false]);
        const pr = block.parentBeaconBlockRoot; if (!pr) continue;
        const ph = await beacon('/eth/v1/beacon/headers/' + pr);
        const slot = parseInt(ph.header.message.slot) + 1;
        if (failedSlots.has(slot)) { skipped++; continue; }
        try {
          const scs = await beacon('/eth/v1/beacon/blob_sidecars/' + slot);
          for (const sc of scs) {
            const hx = (sc.blob || '').replace('0x', '');
            const bs = new Uint8Array(hx.length / 2);
            for (let i = 0; i < bs.length; i++) bs[i] = parseInt(hx.slice(i * 2, i * 2 + 2), 16);
            const p = deserializePost(bs, tx.hash, parseInt(tx.blockNumber, 10));
            if (p) { posts.push(p); newPosts++; break; }
          }
        } catch (e: any) {
          if (e?.message?.includes('404') || e?.message?.includes('NOT_FOUND')) failedSlots.add(slot);
        }
      } catch {}
    }
    console.log('[blobchan] Chain:', newPosts, 'new +', skipped, 'cached');
    return { posts, isFresh: newPosts > 0 };
  } catch { return { posts: [], isFresh: false }; }
}
