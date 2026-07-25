import { tick } from 'svelte';
import { fetchRemotePosts, groupIntoThreads, type Post, type Thread } from './blob';
import type { ChainConfig } from './config';

const stores = new Map<string, PostsStore>();

/** Get (or create) the reactive posts store for a given chain. Each chain has
 *  its own IndexedDB database, polling loop, and in-memory state. */
export function getPosts(chain: ChainConfig): PostsStore {
  let s = stores.get(chain.id);
  if (!s) { s = new PostsStore(chain); stores.set(chain.id, s); }
  return s;
}

class PostsStore {
  private chain: ChainConfig;
  private dbName: string;
  allPosts = $state<Post[]>([]);
  loading = $state(false);
  error = $state('');
  /** Progress of the current fetch: how many txs processed / total. */
  progressLoaded = $state(0);
  progressTotal = $state(0);

  constructor(chain: ChainConfig) {
    this.chain = chain;
    this.dbName = `blobchan_posts_${chain.id}`;
    if (typeof window !== 'undefined') {
      this.init();
      setInterval(() => this.refresh(), 30_000);
    }
  }

  private async init() {
    const cached = await this.dbGetAll();
    if (cached.length > 0) {
      this.allPosts = cached.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      await tick();
    }
    this.refresh();
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('posts')) req.result.createObjectStore('posts', { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async dbGetAll(): Promise<Post[]> {
    const db = await this.openDB();
    return new Promise(resolve => { const tx = db.transaction('posts', 'readonly'); const r = tx.objectStore('posts').getAll(); r.onsuccess = () => resolve(r.result || []); });
  }

  private async dbPutAll(ps: Post[]) {
    const db = await this.openDB();
    const tx = db.transaction('posts', 'readwrite');
    for (const p of ps) tx.objectStore('posts').put(p);
    return new Promise<void>(r => { tx.oncomplete = () => r(); });
  }

  private async refresh() {
    this.loading = true; this.error = ''; this.progressLoaded = 0; this.progressTotal = 0;
    try {
      const cached = await this.dbGetAll();
      const cachedIds = new Set(cached.map(p => p.id));
      // Merge new posts incrementally as they're decoded, so the user sees
      // them appear one-by-one instead of waiting for the full fetch to finish.
      const onPost = (p: Post) => {
        if (this.allPosts.find(x => x.id === p.id)) return;
        this.allPosts = [p, ...this.allPosts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        this.dbPutAll([p]);
      };
      const onProgress = (loaded: number, total: number) => {
        this.progressLoaded = loaded;
        this.progressTotal = total;
      };
      const result = await fetchRemotePosts(this.chain, cachedIds, onPost, onProgress);
      // Final merge to catch any edge cases (e.g. cached posts not yet in memory).
      if (result.isFresh || this.allPosts.length === 0) {
        const map = new Map<string, Post>();
        for (const p of cached) map.set(p.id, p);
        for (const p of this.allPosts) map.set(p.id, p);
        for (const p of result.posts) map.set(p.id, p);
        this.allPosts = [...map.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
    } catch (e: any) { this.error = e.message || 'Failed'; }
    finally { this.loading = false; }
  }

  get all() { return this.allPosts; }
  get threads(): Thread[] { return groupIntoThreads(this.allPosts); }
  get isLoading() { return this.loading; }
  get err() { return this.error; }
  get loaded() { return this.progressLoaded; }
  get total() { return this.progressTotal; }

  forceRefresh() { this.refresh(); }

  addOptimistic(post: Post) {
    if (!this.allPosts.find(p => p.id === post.id)) {
      this.allPosts = [post, ...this.allPosts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      this.dbPutAll([post]);
    }
  }
}
