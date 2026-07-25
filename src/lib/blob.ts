import {
  type WalletClient, type Transport, type Chain, type Account,
  type Hex, parseGwei, bytesToHex,
} from 'viem';
import { BLOBCHAN_MARKER, BLOBCHAN_ADDRESS, ETHERSCAN_API_KEY, RPC_URL } from './config';
import type { Post, Thread } from './types';

const BLOB_SIZE = 131072;
const HEADER_SIZE = 2048;  // fixed header: JSON text, null-padded
const IMG_START = HEADER_SIZE; // image starts right after header
const IMG_MAX = BLOB_SIZE - HEADER_SIZE; // ~129KB for hex image → ~64KB raw
const failedSlots = new Set<number>();

// ---- Packing ----

function packBlob(post: Omit<Post, 'id' | 'blockNumber' | 'image'>, imageHex?: string): Uint8Array {
  const json = BLOBCHAN_MARKER + JSON.stringify(post);
  const blob = new Uint8Array(BLOB_SIZE);

  // Write header (JSON text at offset 0, rest null-padded)
  const jsonBytes = new TextEncoder().encode(json);
  if (jsonBytes.length > HEADER_SIZE) throw new Error('Post text too long');
  blob.set(jsonBytes, 0);

  // Write image hex at fixed offset (safe: hex chars are 0-9a-f, all < 0x74)
  if (imageHex) {
    const imgBytes = new TextEncoder().encode(imageHex);
    if (IMG_START + imgBytes.length > BLOB_SIZE) throw new Error('Image too large');
    blob.set(imgBytes, IMG_START);
  }
  return blob;
}

export function deserializePost(data: Uint8Array, txHash: string, blockNumber?: number): Post | null {
  try {
    // Read JSON from header (until null or end of header)
    let jsonEnd = data.indexOf(0, 0);
    if (jsonEnd === -1 || jsonEnd > HEADER_SIZE) jsonEnd = HEADER_SIZE;
    const raw = new TextDecoder().decode(data.slice(0, jsonEnd));
    if (!raw.startsWith(BLOBCHAN_MARKER)) return null;
    const p = JSON.parse(raw.slice(BLOBCHAN_MARKER.length)) as Post;

    // Read hex image from fixed offset
    let imgHex = '';
    for (let i = IMG_START; i < BLOB_SIZE && data[i] !== 0; i++) {
      imgHex += String.fromCharCode(data[i]);
    }
    const image = imgHex.length > 0 ? hexToDataUrl(imgHex) : undefined;

    return { ...p, id: txHash.replace('0x', ''), threadId: (p.threadId || txHash).replace('0x', ''), blockNumber, image, timestamp: p.timestamp || Math.floor(Date.now() / 1000) };
  } catch { return null; }
}

function hexToDataUrl(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:image/webp;base64,' + btoa(binary);
}

function dataUrlToHex(dataUrl: string): string {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  let hex = '';
  for (let i = 0; i < binary.length; i++) hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
  return hex;
}

// ---- Sending ----

export async function sendBlobPost(args: {
  client: WalletClient<Transport, Chain, Account>;
  post: Omit<Post, 'id' | 'blockNumber' | 'image'>;
  imageDataUrl?: string;
  kzg: any;
}): Promise<string> {
  const { client, post, imageDataUrl, kzg } = args;
  const imgHex = imageDataUrl ? dataUrlToHex(imageDataUrl) : undefined;
  const blob = packBlob(post, imgHex);
  return await client.sendTransaction({
    to: BLOBCHAN_ADDRESS, blobs: [bytesToHex(blob) as Hex], kzg, type: 'eip4844' as any,
    maxFeePerBlobGas: parseGwei('30'), maxFeePerGas: parseGwei('50'), maxPriorityFeePerGas: parseGwei('2'), value: 0n,
  });
}

// ---- Reading ----

export function groupIntoThreads(posts: Post[]): Thread[] {
  const ops = posts.filter(p => p.threadId === p.id);
  return ops.map(op => ({ op, replies: posts.filter(p => p.threadId === op.id && p.id !== op.id) }));
}

async function rpc(method: string, params: any[]) {
  const r = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const d = await r.json(); if (d.error) throw new Error(d.error.message); return d.result;
}

async function beacon(path: string) {
  const baseUrl = (typeof window !== 'undefined' ? '/api/' : RPC_URL);
  const r = await fetch(baseUrl + path);
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
      const sh = tx.hash.replace('0x', '');
      if (cachedIds?.has(sh)) { skipped++; continue; }
      try {
        const block = await rpc('eth_getBlockByHash', [tx.blockHash, false]);
        const pr = block.parentBeaconBlockRoot; if (!pr) continue;
        const ph = await beacon('eth/v1/beacon/headers/' + pr);
        const slot = parseInt(ph.header.message.slot) + 1;
        if (failedSlots.has(slot)) { skipped++; continue; }
        try {
          const scs = await beacon('eth/v1/beacon/blob_sidecars/' + slot);
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
