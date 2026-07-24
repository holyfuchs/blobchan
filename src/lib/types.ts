export interface Post {
	id: string;
	board: string;
	threadId: string;
	subject?: string;
	name: string;
	content: string;
	timestamp: number;
	blockNumber?: number;
}

export interface Thread {
	op: Post;
	replies: Post[];
}

export interface EphemeralWallet {
	address: string;
	privateKey: string;
	createdAt: number;
}
