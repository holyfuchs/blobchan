export interface Post {
  id: string;
  board: string;
  threadId: string;
  subject?: string;
  name: string;
  content: string;
  image?: string;
  /** MIME type of the stored image (e.g. `image/webp`, `image/png`). Stored
   *   in the blob header so reads reconstruct the data URL with the right MIME.
   *   Older posts without this field fall back to `image/webp`. */
  imageMime?: string;
  /** Original filename the user selected, shown in the `File:` info bar to
   *   match the classic imageboard layout. Optional — older posts and posts
   *   without an image have no value. */
  imageName?: string;
  timestamp: number;
  blockNumber?: number;
  /** Actual gas cost of this post's transaction, in wei (as a decimal string
   *  so it survives JSON serialization for IndexedDB). Fetched from the tx
   *  receipt. Undefined for posts that haven't been cost-fetched yet. */
  txCost?: string;
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
