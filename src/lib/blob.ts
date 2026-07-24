import {
	type WalletClient,
	type Transport,
	type Chain,
	type Account,
	type Hex,
	parseGwei,
	bytesToHex
} from 'viem';
import { BLOBCHAN_MARKER, BLOBCHAN_ADDRESS } from './config';
import type { Post, Thread } from './types';

const BLOB_SIZE = 131072;

export function deserializePost(
	data: Uint8Array,
	txHash: string,
	blockNumber?: number
): Post | null {
	try {
		let end = data.indexOf(0);
		if (end === -1) end = data.length;
		const raw = new TextDecoder().decode(data.slice(0, end));
		if (!raw.startsWith(BLOBCHAN_MARKER)) return null;
		const p = JSON.parse(raw.slice(BLOBCHAN_MARKER.length)) as Omit<Post, 'id' | 'blockNumber'>;
		return {
			...p,
			id: txHash,
			blockNumber,
			timestamp: p.timestamp || Math.floor(Date.now() / 1000)
		};
	} catch {
		return null;
	}
}

export async function sendBlobPost(args: {
	client: WalletClient<Transport, Chain, Account>;
	post: Omit<Post, 'id' | 'blockNumber'>;
	kzg: any;
}): Promise<string> {
	const { client, post, kzg } = args;
	const raw = BLOBCHAN_MARKER + JSON.stringify(post);
	const bytes = new TextEncoder().encode(raw);
	if (bytes.length > BLOB_SIZE) throw new Error('Post too large');
	const blob = new Uint8Array(BLOB_SIZE);
	blob.set(bytes);
	return await client.sendTransaction({
		to: BLOBCHAN_ADDRESS,
		blobs: [bytesToHex(blob) as Hex],
		kzg,
		type: 'eip4844' as any,
		maxFeePerBlobGas: parseGwei('30'),
		maxFeePerGas: parseGwei('50'),
		maxPriorityFeePerGas: parseGwei('2'),
		value: 0n
	});
}

export function groupIntoThreads(posts: Post[]): Thread[] {
	const ops = posts.filter((p) => p.threadId === p.id);
	return ops.map((op) => ({
		op,
		replies: posts.filter((p) => p.threadId === op.id && p.id !== op.id)
	}));
}

export async function fetchRemotePosts(): Promise<Post[]> {
	try {
		const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${BLOBCHAN_ADDRESS}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`;
		const res = await fetch(url);
		const data = await res.json();
		if (data.status !== '1' || !data.result) return [];
		const posts: Post[] = [];
		for (const tx of data.result) {
			if (tx.to?.toLowerCase() !== BLOBCHAN_ADDRESS.toLowerCase()) continue;
			try {
				const rr = await fetch('https://eth-sepolia.g.alchemy.com/v2/alch_TEaj9L-Wl0XpsqGmm0wOH', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'debug_getRawTransaction',
						params: [tx.hash]
					})
				});
				const j = await rr.json();
				const rawTx = j?.result;
				if (!rawTx) continue;
				const hex = rawTx.startsWith('0x') ? rawTx.slice(2) : rawTx;
				const bytes = new Uint8Array(hex.length / 2);
				for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
				const marker = new TextEncoder().encode(BLOBCHAN_MARKER);
				for (let i = 0; i <= bytes.length - marker.length; i++) {
					if (bytes.slice(i, i + marker.length).every((b, j) => b === marker[j])) {
						const p = deserializePost(
							bytes.slice(i, i + BLOB_SIZE),
							tx.hash,
							parseInt(tx.blockNumber, 10)
						);
						if (p) posts.push(p);
						break;
					}
				}
			} catch {
				/* skip */
			}
		}
		return posts;
	} catch {
		return [];
	}
}
