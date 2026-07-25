let nsfwOn = $state(true);
export const nsfw = {
  get on() { return nsfwOn; },
  toggle() { nsfwOn = !nsfwOn; },
};
