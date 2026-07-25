import {
  type WalletClient, type Transport, type Chain, type Account,
  type Hex, parseGwei, bytesToHex,
} from 'viem';
import { BLOBCHAN_MARKER, BLOBCHAN_ADDRESS, ETHERSCAN_API_KEY, RPC_URL, BEACON_URL } from './config';
import type { Post, Thread } from './types';

const BLOB_SIZE = 131072;
const HEADER_SIZE = 2048;
const IMG_START = HEADER_SIZE;
const failedSlots = new Set<number>();

/** Maximum UTF-8 byte size of the serialized post JSON (including the `BLOBCHAN:` marker). */
export const POST_HEADER_LIMIT = HEADER_SIZE;

/**
 * Computes the UTF-8 byte length the post header will occupy inside the blob,
 * using the same serialization as `packBlob`. Use this in the UI to validate
 * before submitting, so the user gets a friendly error instead of a thrown one.
 */
export function postHeaderBytes(post: Omit<Post, 'id' | 'blockNumber' | 'image'>): number {
  const json = BLOBCHAN_MARKER + JSON.stringify(post);
  return new TextEncoder().encode(json).length;
}

function packBlob(post: Omit<Post, 'id' | 'blockNumber' | 'image'>, imageHex?: string): Uint8Array {
  const json = BLOBCHAN_MARKER + JSON.stringify(post);
  const blob = new Uint8Array(BLOB_SIZE);
  const jsonBytes = new TextEncoder().encode(json);
  if (jsonBytes.length > HEADER_SIZE) throw new Error(`Post text too long (${jsonBytes.length}/${HEADER_SIZE} bytes)`);
  blob.set(jsonBytes, 0);
  if (imageHex) {
    const imgBytes = new TextEncoder().encode(imageHex);
    if (IMG_START + imgBytes.length > BLOB_SIZE) throw new Error('Image too large');
    blob.set(imgBytes, IMG_START);
  }
  return blob;
}

export function deserializePost(data: Uint8Array, txHash: string, blockNumber?: number): Post | null {
  try {
    let jsonEnd = data.indexOf(0, 0);
    if (jsonEnd === -1 || jsonEnd > HEADER_SIZE) jsonEnd = HEADER_SIZE;
    const raw = new TextDecoder().decode(data.slice(0, jsonEnd));
    if (!raw.startsWith(BLOBCHAN_MARKER)) return null;
    const p = JSON.parse(raw.slice(BLOBCHAN_MARKER.length)) as any;
    let imgHex = '';
    for (let i = IMG_START; i < BLOB_SIZE && data[i] !== 0; i++) imgHex += String.fromCharCode(data[i]);
    const image = imgHex.length > 0 ? hexToDataUrl(imgHex) : (p.image || undefined);
    return { ...p, id: txHash.replace('0x', ''), threadId: (p.threadId || txHash).replace('0x', ''), blockNumber, image, timestamp: p.timestamp || Math.floor(Date.now() / 1000) };
  } catch { return null; }
}

function hexToDataUrl(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let b = ''; for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  return 'data:image/webp;base64,' + btoa(b);
}

function dataUrlToHex(u: string): string {
  const b = atob(u.split(',')[1]); let h = '';
  for (let i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, '0');
  return h;
}

export async function sendBlobPost(args: {
  client: WalletClient<Transport, Chain, Account>;
  post: Omit<Post, 'id' | 'blockNumber' | 'image'>;
  imageDataUrl?: string;
  kzg: any;
}): Promise<string> {
  const { client, post, imageDataUrl, kzg } = args;
  const blob = packBlob(post, imageDataUrl ? dataUrlToHex(imageDataUrl) : undefined);
  return await client.sendTransaction({
    to: BLOBCHAN_ADDRESS, blobs: [bytesToHex(blob) as Hex], kzg, type: 'eip4844' as any,
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
