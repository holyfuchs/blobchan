import { fetchRemotePosts, groupIntoThreads, type Post, type Thread } from './blob';

let allPosts = $state<Post[]>([]);
let loading = $state(false);
let error = $state('');

async function refresh() {
  loading = true; error = '';
  try {
    const fetched = await fetchRemotePosts();
    console.log('[blobchan] Fetched', fetched.length, 'posts from chain');
    if (fetched.length > 0) allPosts = fetched;
  } catch (e: any) {
    console.error('[blobchan] Fetch failed:', e.message || e);
    error = e.message || 'Failed';
  } finally { loading = false; }
}

if (typeof window !== 'undefined') {
  refresh();
  setInterval(refresh, 30_000);
}

export const posts = {
  get all() { return allPosts; },
  get threads(): Thread[] { return groupIntoThreads(allPosts); },
  get loading() { return loading; },
  get error() { return error; },
  refresh,
  addOptimistic(post: Post) {
    if (!allPosts.find(p => p.id === post.id)) allPosts = [post, ...allPosts];
  },
};
