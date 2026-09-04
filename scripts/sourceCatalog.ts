export type SourceAccess = 'official-api' | 'official-feed' | 'manual-review';
export type SourceStatus = 'ready' | 'configured' | 'manual-license-review' | 'unavailable';

export type SourceDefinition = {
  id: string;
  name: string;
  access: SourceAccess;
  status: SourceStatus;
  endpoint: string;
  license: string;
  attribution: string;
  rateLimit: string;
  notes: string;
};

/**
 * This catalog is deliberately explicit. A source is never treated as scrapeable
 * just because a public web page exists.
 */
export const SOURCE_CATALOG: readonly SourceDefinition[] = [
  {
    id: 'hacker-news',
    name: 'Hacker News',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://hacker-news.firebaseio.com/v0',
    license: 'Public API; linked content remains owned by its authors',
    attribution: 'Hacker News / Y Combinator',
    rateLimit: 'Use small batches and avoid polling; public Firebase API',
    notes: 'Ask HN and Show HN story metadata only. No linked-page scraping.',
  },
  {
    id: 'github',
    name: 'GitHub',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://api.github.com/search/repositories',
    license: 'Repository-specific licenses and GitHub API terms',
    attribution: 'GitHub and the repository authors',
    rateLimit: 'Unauthenticated REST API limit applies; token is optional and never committed',
    notes: 'Only public repository metadata is eligible; inspect each repository license before reuse.',
  },
  {
    id: 'data-gov',
    name: 'Data.gov',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://catalog.data.gov/api/3/action/package_search',
    license: 'Dataset-specific; verify the dataset landing page',
    attribution: 'Data.gov and the publishing agency',
    rateLimit: 'Respect catalog API service limits',
    notes: 'Catalog metadata is safe to index; dataset contents retain their publisher terms.',
  },
  {
    id: 'world-bank',
    name: 'World Bank',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://api.worldbank.org/v2',
    license: 'World Bank Open Data terms',
    attribution: 'World Bank Open Data',
    rateLimit: 'Keep requests low and cache responses',
    notes: 'Use indicator metadata and public observations, not bulk scraping.',
  },
  {
    id: 'nasa',
    name: 'NASA',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://api.nasa.gov',
    license: 'NASA media and data guidance; item-specific restrictions may apply',
    attribution: 'NASA',
    rateLimit: 'API key and endpoint-specific limits; DEMO_KEY is for light testing only',
    notes: 'A NASA API key may be supplied through an environment variable, never checked in.',
  },
  {
    id: 'openalex',
    name: 'OpenAlex',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://api.openalex.org/works',
    license: 'OpenAlex data under its published open-data terms',
    attribution: 'OpenAlex and the cited works',
    rateLimit: 'Use a descriptive User-Agent, bounded page sizes, and cached responses; add mailto only when available',
    notes: 'Bibliographic metadata only; do not republish article full text.',
  },
  {
    id: 'openstreetmap',
    name: 'OpenStreetMap',
    access: 'official-api',
    status: 'manual-license-review',
    endpoint: 'https://overpass-api.de/api/interpreter',
    license: 'ODbL 1.0; attribution and share-alike obligations apply',
    attribution: '© OpenStreetMap contributors',
    rateLimit: 'Overpass/Nominatim usage policies; no bulk or high-volume requests',
    notes: 'Requires a reviewed query, caching, and an attribution decision before activation.',
  },
  {
    id: 'wikimedia',
    name: 'Wikimedia',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://commons.wikimedia.org/w/api.php',
    license: 'Item-specific Wikimedia Commons license',
    attribution: 'Wikimedia Commons and the individual creator',
    rateLimit: 'Use API etiquette, a descriptive User-Agent, and cached requests',
    notes: 'Every media item must retain its own license and creator attribution.',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    access: 'manual-review',
    status: 'manual-license-review',
    endpoint: 'https://www.reddit.com/dev/api/',
    license: 'Reddit API terms and post/comment author rights',
    attribution: 'Reddit and the individual authors',
    rateLimit: 'OAuth and current API policy required',
    notes: 'Disabled until an application, OAuth flow, and current reuse policy are reviewed.',
  },
  {
    id: 'dev-to',
    name: 'DEV.to',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://dev.to/api/articles',
    license: 'Article-specific author and platform terms',
    attribution: 'DEV Community and the article author',
    rateLimit: 'Use the documented API and modest page sizes',
    notes: 'Metadata and links only; do not copy article bodies.',
  },
  {
    id: 'kaggle',
    name: 'Kaggle',
    access: 'manual-review',
    status: 'manual-license-review',
    endpoint: 'https://www.kaggle.com/api/v1',
    license: 'Dataset-specific Kaggle license',
    attribution: 'Kaggle and the dataset owner',
    rateLimit: 'Authentication and current API terms required',
    notes: 'Disabled until dataset licensing and authenticated API use are reviewed.',
  },
  {
    id: 'stack-overflow',
    name: 'Stack Overflow',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://api.stackexchange.com/2.3/questions',
    license: 'CC BY-SA for user contributions; Stack Exchange API terms',
    attribution: 'Stack Overflow contributors',
    rateLimit: 'Use API quotas, backoff, and a registered app when appropriate',
    notes: 'Questions and tags can suggest problems; do not copy answers into generated stories.',
  },
  {
    id: 'eu-open-data',
    name: 'EU Open Data',
    access: 'official-api',
    status: 'ready',
    endpoint: 'https://data.europa.eu/api/hub/search/datasets',
    license: 'Dataset-specific European data licence',
    attribution: 'data.europa.eu and the publishing institution',
    rateLimit: 'Portal API limits and dataset terms apply',
    notes: 'Keep the dataset landing URL and licence for every candidate.',
  },
] as const;

export const sourceById = new Map(SOURCE_CATALOG.map((source) => [source.id, source]));

export function getSourceDefinition(sourceId: string): SourceDefinition {
  const source = sourceById.get(sourceId);
  if (!source) throw new Error(`Unknown source: ${sourceId}`);
  return source;
}
