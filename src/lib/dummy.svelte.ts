export interface Post {
	id: string;
	threadId: string;
	board: string;
	subject?: string;
	name: string;
	content: string;
	timestamp: number;
}

export interface Thread {
	op: Post;
	replies: Post[];
}

export const dummyPosts: Post[] = [
	{
		id: '0xabc001',
		threadId: '0xabc001',
		board: 'b',
		subject: 'Welcome to blobchan',
		name: 'Anonymous',
		content:
			'Welcome to blobchan — the on-chain imageboard.\nAll posts are stored in EIP-4844 blobs on Sepolia.\n\n>be me\n>discover blobchan\n>posts live on EVM as blobs\n>immutable for ~18 days\n>mfw decentralized shitposting is real\n\nFeel free to post anything. Connect your wallet to get started.',
		timestamp: Math.floor(Date.now() / 1000) - 3600
	},
	{
		id: '0xabc002',
		threadId: '0xabc001',
		board: 'b',
		name: 'Anon',
		content: '>>0xabc001\nThis is pretty cool. How does the blob storage work?',
		timestamp: Math.floor(Date.now() / 1000) - 3000
	},
	{
		id: '0xabc003',
		threadId: '0xabc001',
		board: 'b',
		name: 'dev',
		content:
			'>>0xabc002\nEach post is a 128 KB EIP-4844 blob transaction on Sepolia testnet.\n\nThe KZG commitments are computed client-side via WASM — no server needed. Your wallet signs the tx and the data lives in the blob sidecar.\n\nGas cost is minimal (~0.0001 ETH per post).',
		timestamp: Math.floor(Date.now() / 1000) - 2400
	},
	{
		id: '0xabc004',
		threadId: '0xabc001',
		board: 'b',
		name: 'Anonymous',
		content:
			'>>0xabc003\n>KZG commitments computed client-side\n>no server needed\n\nbased and blobpilled\n\nThis is what web3 was supposed to be.',
		timestamp: Math.floor(Date.now() / 1000) - 1800
	},
	{
		id: '0xabc005',
		threadId: '0xabc001',
		board: 'b',
		name: 'skeptic',
		content:
			">>0xabc003\n>128 KB per post\n\nSo you can fit like 500 lines of text in one post?\n\nThat's actually pretty good for text-only. Way better than calldata.",
		timestamp: Math.floor(Date.now() / 1000) - 1200
	},
	{
		id: '0xdef001',
		threadId: '0xdef001',
		board: 'b',
		subject: 'Greentext thread',
		name: 'Anonymous',
		content:
			">be me\n>discover blobchan\n>realize posts are on-chain forever\n>mfw immutable shitposting\n>start greentexting everything\n>can't stop\n>send help\n\nPost your best greentext stories. They'll live on the blockchain until blob expiry.",
		timestamp: Math.floor(Date.now() / 1000) - 7200
	},
	{
		id: '0xdef002',
		threadId: '0xdef001',
		board: 'b',
		name: 'green anon',
		content:
			'>be ethereum dev\n>spend 6 hours debugging KZG WASM loading\n>bug was hex strings vs raw bytes in trusted setup\n>finally get it working at 3am\n>post test message\n>gas costs 0.0001 ETH\n>mfw worth it',
		timestamp: Math.floor(Date.now() / 1000) - 6000
	},
	{
		id: '0xdef003',
		threadId: '0xdef001',
		board: 'b',
		name: 'Anonymous',
		content:
			">be me\n>connect wallet to blobchan\n>generate ephemeral posting key\n>fund it with 0.01 ETH\n>start posting\n>watch transactions confirm on etherscan\n>realize I'm literally writing to the blockchain\n>feelsgoodman.jpg",
		timestamp: Math.floor(Date.now() / 1000) - 5000
	},
	{
		id: '0xdef004',
		threadId: '0xdef001',
		board: 'b',
		name: 'builder',
		content:
			'>tfw no gf\n>instead build on-chain 4chan clone\n>spend all weekend on KZG math\n>deploy to sepolia\n>post this greentext\n>this is my life now',
		timestamp: Math.floor(Date.now() / 1000) - 4000
	}
];

export function getThreads(): Thread[] {
	const ops = dummyPosts.filter((p) => p.threadId === p.id);
	return ops.map((op) => ({
		op,
		replies: dummyPosts.filter((p) => p.threadId === op.id && p.id !== op.id)
	}));
}

export function getThread(id: string): Thread | undefined {
	const op = dummyPosts.find((p) => p.id === id && p.threadId === p.id);
	if (!op) return undefined;
	return {
		op,
		replies: dummyPosts.filter((p) => p.threadId === id && p.id !== id)
	};
}
