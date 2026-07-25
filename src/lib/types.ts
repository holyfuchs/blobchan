export interface Post {
  id: string;
  board: string;
  threadId: string;
  subject?: string;
  name: string;
  content: string;
  image?: string;
  /** MIME type of the stored image (e.g. `image/webp`, `image/png`). Stored
   *  in the blob header so reads reconstruct the data URL with the right MIME.
   *  Older posts without this field fall back to `image/webp`. */
  imageMime?: string;
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
