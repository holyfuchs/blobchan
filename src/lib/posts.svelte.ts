import { tick } from 'svelte';
import { fetchRemotePosts, groupIntoThreads, type Post, type Thread } from './blob';

const DB = 'blobchan_posts';
let allPosts = $state<Post[]>([]);
let loading = $state(false);
let error = $state('');

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('posts')) req.result.createObjectStore('posts', { keyPath: 'id' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<Post[]> {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction('posts', 'readonly');
    const req = tx.objectStore('posts').getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function dbPutAll(ps: Post[]) {
  const db = await openDB();
  const tx = db.transaction('posts', 'readwrite');
  for (const p of ps) tx.objectStore('posts').put(p);
  return new Promise<void>(r => { tx.oncomplete = () => r(); });
}

async function refresh() {
  loading = true; error = '';
  try {
    const cached = await dbGetAll();
    const cachedIds = new Set(cached.map(p => p.id));
    const result = await fetchRemotePosts(cachedIds);
    if (result.isFresh || allPosts.length === 0) {
      const map = new Map<string, Post>();
      for (const p of cached) map.set(p.id, p);
      for (const p of result.posts) map.set(p.id, p);
      allPosts = [...map.values()].sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
      if (result.posts.length > 0) dbPutAll(result.posts);
    }
  } catch (e: any) { error = e.message || 'Failed'; }
  finally { loading = false; }
}

if (typeof window !== 'undefined') {
  dbGetAll().then(async cached => {
    if (cached.length > 0) {
      allPosts = cached;
      await tick();
    }
    refresh();
  });
  setInterval(refresh, 30_000);
}

export const posts = {
  get all() { return allPosts; },
  get threads(): Thread[] {
    const t = groupIntoThreads(allPosts);
    return t;
  },
  get loading() { return loading; },
  get error() { return error; },
  refresh,
  addOptimistic(post: Post) {
    if (!allPosts.find(p => p.id === post.id)) { allPosts = [post, ...allPosts]; dbPutAll([post]); }
  },
};
