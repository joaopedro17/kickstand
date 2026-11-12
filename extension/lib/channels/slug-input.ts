/** Kick's channel lookup takes at most 50 slugs per request; one submit is one request. */
export const MAX_SLUGS_PER_SUBMIT = 50;

const SLUG = /^[a-z0-9_-]{1,25}$/;
const KICK_LINK = /^(?:https?:\/\/)?(?:www\.)?kick\.com\/(.*)$/i;

/** First path segments of kick.com pages that are not channels. */
const SITE_PAGES = new Set([
  'browse',
  'categories',
  'category',
  'clips',
  'community-guidelines',
  'dashboard',
  'following',
  'help',
  'privacy-policy',
  'search',
  'settings',
  'terms-of-service',
  'video',
  'videos',
]);

export interface SlugInput {
  /** Channel slugs, lower-case, each once, in the order given. */
  slugs: string[];
  /** Pieces of the input that are neither a slug nor a kick.com channel link. */
  invalid: string[];
  /** Valid slugs left out because the input had more than MAX_SLUGS_PER_SUBMIT. */
  skipped: string[];
}

function channelOfPath(path: string): string | null {
  const first = path.split(/[/?#]/)[0].toLowerCase();
  return SLUG.test(first) && !SITE_PAGES.has(first) ? first : null;
}

/** The slug a piece of input names: `slug`, `@slug` or a kick.com channel link. */
function slugOf(piece: string): string | null {
  const link = KICK_LINK.exec(piece);
  if (link) return channelOfPath(link[1]);
  const slug = piece.replace(/^@/, '').toLowerCase();
  return SLUG.test(slug) ? slug : null;
}

/** Reads slugs, @names and kick.com links separated by spaces, commas, semicolons or new lines. */
export function parseSlugInput(text: string): SlugInput {
  const pieces = text.split(/[\s,;]+/).filter((p) => p !== '');
  const unique = new Set<string>();
  const invalid: string[] = [];
  for (const piece of pieces) {
    const slug = slugOf(piece);
    if (slug) unique.add(slug);
    else invalid.push(piece);
  }
  const slugs = [...unique];
  return {
    slugs: slugs.slice(0, MAX_SLUGS_PER_SUBMIT),
    invalid,
    skipped: slugs.slice(MAX_SLUGS_PER_SUBMIT),
  };
}

/** The channel a browser tab is showing, or null when it isn't a kick.com channel page. */
export function slugFromKickUrl(url: string | undefined): string | null {
  const page = url && /^https:\/\/(?:www\.)?kick\.com\/(.*)$/i.exec(url);
  return page ? channelOfPath(page[1]) : null;
}
