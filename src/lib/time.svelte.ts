/** Reactive clock that ticks once per second. Used by the blob-expiry
 *  countdown so it updates live without each component managing its own
 *  interval. Module-level singleton — lives for the page lifetime, matching
 *  the pattern used by `posts.svelte.ts` and `store.svelte.ts`. */
let now = $state(Date.now());

if (typeof window !== 'undefined') {
	setInterval(() => { now = Date.now(); }, 1000);
}

export const clock = {
	get now() { return now; }
};
