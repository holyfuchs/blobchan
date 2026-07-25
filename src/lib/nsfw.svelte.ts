const KEY = 'blobchan_nsfw';

function ls() { return typeof window !== 'undefined' ? window.localStorage : null; }

function load(): boolean {
  // Default to NSFW on (matches the original behavior and the existing "🔞 NSFW"
  // button's initial state) when no stored preference exists yet.
  const raw = ls()?.getItem(KEY);
  if (raw === '0') return false;
  if (raw === '1') return true;
  return true;
}

let nsfwOn = $state(load());

export const nsfw = {
  get on() { return nsfwOn; },
  toggle() {
    nsfwOn = !nsfwOn;
    ls()?.setItem(KEY, nsfwOn ? '1' : '0');
  },
};
