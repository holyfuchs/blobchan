import {
  type WalletClient, type Transport, type Chain, type Account,
  type Hex, parseGwei, bytesToHex,
} from 'viem';
import { BLOBCHAN_MARKER, BLOBCHAN_ADDRESS, ETHERSCAN_API_KEY, RPC_URL } from './config';
import type { Post, Thread } from './types';

const BLOB_SIZE = 131072;

export function deserializePost(data: Uint8Array, txHash: string, blockNumber?: number): Post | null {
  try {
    let end = data.indexOf(0); if (end === -1) end = data.length;
    const raw = new TextDecoder().decode(data.slice(0, end));
    if (!raw.startsWith(BLOBCHAN_MARKER)) return null;
    const p = JSON.parse(raw.slice(BLOBCHAN_MARKER.length)) as Omit<Post, 'id' | 'blockNumber'>;
    return { ...p, id: txHash.replace('0x', ''), threadId: (p.threadId || txHash).replace('0x', ''), blockNumber, timestamp: p.timestamp || Math.floor(Date.now() / 1000) };
  } catch { return null; }
}

export async function sendBlobPost(args: {
  client: WalletClient<Transport, Chain, Account>;
  post: Omit<Post, 'id' | 'blockNumber'>;
  kzg: any;
}): Promise<string> {
  const { client, post, kzg } = args;
  const bytes = new TextEncoder().encode(BLOBCHAN_MARKER + JSON.stringify(post));
  if (bytes.length > BLOB_SIZE) throw new Error('Post too large');
  const blob = new Uint8Array(BLOB_SIZE);
  blob.set(bytes);
  return await client.sendTransaction({
    to: BLOBCHAN_ADDRESS, blobs: [bytesToHex(blob) as Hex], kzg, type: 'eip4844' as any,
    maxFeePerBlobGas: parseGwei('30'), maxFeePerGas: parseGwei('50'), maxPriorityFeePerGas: parseGwei('2'), value: 0n,
  });
}

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
    if (data.status !== '1' || !data.result) { console.log('[blobchan] Etherscan: no results'); return { posts: [], isFresh: false }; }

    const posts: Post[] = []; let newPosts = 0; let skipped = 0;
    for (const tx of data.result) {
      if (tx.to?.toLowerCase() !== BLOBCHAN_ADDRESS.toLowerCase()) continue;
      // Check cache — tx.hash has 0x, cached IDs don't
      const strippedHash = tx.hash.replace('0x', '');
      if (cachedIds?.has(strippedHash)) { skipped++; continue; }
      try {
        const block = await rpc('eth_getBlockByHash', [tx.blockHash, false]);
        const parentRoot = block.parentBeaconBlockRoot; if (!parentRoot) continue;
        const parentHeader = await beacon('eth/v1/beacon/headers/' + parentRoot);
        const ourSlot = parseInt(parentHeader.header.message.slot) + 1;
        const sidecars = await beacon('eth/v1/beacon/blob_sidecars/' + ourSlot);
        for (const sc of sidecars) {
          const hex = (sc.blob || '').replace('0x', '');
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
          const p = deserializePost(bytes, tx.hash, parseInt(tx.blockNumber, 10));
          if (p) { posts.push(p); newPosts++; break; }
        }
      } catch { /* skip */ }
    }
    console.log('[blobchan] Chain:', newPosts, 'new +', skipped, 'cached =', newPosts + skipped, 'total txs');
    return { posts, isFresh: newPosts > 0 };
  } catch { return { posts: [], isFresh: false }; }
}
