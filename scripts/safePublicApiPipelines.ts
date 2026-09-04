import type { NormalizedIdea } from '../src/types';
import { deduplicateIdeas } from './hackerNewsPipeline';
import type { SourceDefinition } from './sourceCatalog';
import { normalizeSourceMetadata } from './sourceNormalization';
import { cutoffTimestamp, RECENCY_WINDOW_DAYS } from './retentionPolicy';

export const MAX_SOURCE_RECORDS = 20;
export const DATA_GOV_API = 'https://api.gsa.gov/technology/datagov/v4/search';
export const WORLD_BANK_API = 'https://api.worldbank.org/v2';
export const NASA_API = 'https://api.nasa.gov/planetary/apod';
export const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php';
export const DEV_TO_API = 'https://dev.to/api/articles';
export const STACK_OVERFLOW_API = 'https://api.stackexchange.com/2.3/questions';
export const EU_OPEN_DATA_API = 'https://data.europa.eu/api/hub/search/search';

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type SourceNormalizer<T> = (records: T[], collectedAt: string, definition: SourceDefinition) => NormalizedIdea[];

function boundedRecords<T>(ideas: NormalizedIdea[]): NormalizedIdea[] {
  return deduplicateIdeas(ideas).slice(0, MAX_SOURCE_RECORDS);
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SOURCE_RECORDS) {
    throw new Error(`limit must be an integer between 1 and ${MAX_SOURCE_RECORDS}.`);
  }
}

async function fetchJson<T>(
  fetcher: Fetcher,
  url: string,
  sourceName: string,
  headers: Record<string, string> = {},
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'IdeaAtlas/1.0',
          ...headers,
        },
      });
      if (!response.ok) {
        const error = new Error(`${sourceName} API request failed (${response.status}).`);
        if (response.status < 500 && response.status !== 429) throw error;
        lastError = error;
      } else {
        return response.json() as Promise<T>;
      }
    } catch (error) {
      if (error instanceof Error) lastError = error;
      else lastError = new Error(String(error));
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError ?? new Error(`${sourceName} API request failed.`);
}

function normalizeRecords<T>(
  records: T[],
  collectedAt: string,
  definition: SourceDefinition,
  normalizer: SourceNormalizer<T>,
): NormalizedIdea[] {
  return boundedRecords(normalizer(records, collectedAt, definition));
}

export type DataGovPackage = {
  id?: string;
  name?: string;
  title?: string;
  notes?: string;
  url?: string;
  metadata_modified?: string;
  metadata_created?: string;
  organization?: { title?: string; name?: string };
  license_title?: string;
  license_id?: string;
  dcat?: {
    identifier?: string;
    title?: string;
    description?: string;
    landingPage?: string;
    modified?: string;
    issued?: string;
    license?: string;
    keyword?: string[];
    publisher?: { name?: string };
  };
};

type DataGovResponse = { results?: DataGovPackage[] };

function normalizeDataGovRecords(records: DataGovPackage[], collectedAt: string, definition: SourceDefinition): NormalizedIdea[] {
  return records.flatMap((record) => {
    const dcat = record.dcat;
    const title = (record.title || dcat?.title)?.trim();
    const id = (record.id || dcat?.identifier || record.name)?.trim();
    if (!id || !title) return [];
    const url = (record.url || dcat?.landingPage)?.trim() ||
      `https://catalog.data.gov/dataset/${encodeURIComponent(record.name?.trim() || id)}`;
    const normalized = normalizeSourceMetadata(definition, {
      id,
      title,
      summary: record.notes || dcat?.description,
      url,
      publishedAt: record.metadata_modified || dcat?.modified || record.metadata_created || dcat?.issued,
      category: 'Data & Civic Tech',
      difficulty: 'Intermediate',
      technologies: ['Data', 'Open Data', ...(record.organization?.title || dcat?.publisher?.name
        ? [record.organization?.title || dcat?.publisher?.name as string]
        : [])],
      datasetTools: 'Data.gov CKAN API',
      license: record.license_title || record.license_id || dcat?.license,
      usageNote: 'Dataset contents retain the publishing agency licence; review the dataset landing page before reuse.',
      attribution: `${definition.attribution}${record.organization?.title || dcat?.publisher?.name
        ? `; ${record.organization?.title || dcat?.publisher?.name}` : ''}`,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });
}

export function normalizeDataGovPackages(
  records: DataGovPackage[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return normalizeRecords(records, collectedAt, definition, normalizeDataGovRecords);
}

export async function fetchDataGovPackages(
  fetcher: Fetcher = fetch,
  limit = MAX_SOURCE_RECORDS,
): Promise<DataGovPackage[]> {
  validateLimit(limit);
  const url = new URL(DATA_GOV_API);
  url.searchParams.set('q', 'software OR data');
  url.searchParams.set('limit', String(limit));
  const apiKey = process.env.DATAGOV_API_KEY || 'DEMO_KEY';
  const payload = await fetchJson<DataGovResponse>(fetcher, url.toString(), 'Data.gov', { 'x-api-key': apiKey });
  return Array.isArray(payload.results) ? payload.results.slice(0, limit) : [];
}

export type WorldBankIndicator = {
  id?: string;
  name?: string;
  lastupdated?: string;
  source?: { value?: string };
};

type WorldBankResponse = [unknown, WorldBankIndicator[]?];

function normalizeWorldBankRecords(
  records: WorldBankIndicator[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return records.flatMap((record) => {
    const id = record.id?.trim();
    const title = record.name?.trim();
    if (!id || !title) return [];
    const normalized = normalizeSourceMetadata(definition, {
      id,
      title,
      url: `https://data.worldbank.org/indicator/${encodeURIComponent(id)}`,
      publishedAt: record.lastupdated,
      category: 'Data & Civic Tech',
      difficulty: 'Intermediate',
      technologies: ['Data', 'Statistics', 'Open Data'],
      datasetTools: 'World Bank Indicators API',
      usageNote: 'World Bank indicator metadata and observations are subject to the World Bank Open Data terms.',
      attribution: `${definition.attribution}${record.source?.value ? `; ${record.source.value}` : ''}`,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });
}

export function normalizeWorldBankIndicators(
  records: WorldBankIndicator[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return normalizeRecords(records, collectedAt, definition, normalizeWorldBankRecords);
}

export async function fetchWorldBankIndicators(
  fetcher: Fetcher = fetch,
  limit = MAX_SOURCE_RECORDS,
): Promise<WorldBankIndicator[]> {
  validateLimit(limit);
  const url = new URL(`${WORLD_BANK_API}/indicator`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('per_page', String(limit));
  url.searchParams.set('page', '1');
  const payload = await fetchJson<WorldBankResponse>(fetcher, url.toString(), 'World Bank');
  return Array.isArray(payload[1]) ? payload[1].slice(0, limit) : [];
}

export type NasaApod = {
  date?: string;
  title?: string;
  explanation?: string;
  url?: string;
  hdurl?: string;
  media_type?: string;
  copyright?: string;
};

function normalizeNasaRecords(records: NasaApod[], collectedAt: string, definition: SourceDefinition): NormalizedIdea[] {
  return records.flatMap((record) => {
    const title = record.title?.trim();
    const url = record.url?.trim();
    if (!title || !url || !/^https?:\/\//i.test(url) || record.media_type === 'audio') return [];
    const normalized = normalizeSourceMetadata(definition, {
      id: record.date?.trim() || title,
      title,
      url,
      publishedAt: record.date,
      category: 'Science & Space',
      difficulty: 'Starter',
      technologies: ['NASA API', record.media_type === 'video' ? 'Video' : 'Images'],
      datasetTools: 'NASA APOD API',
      usageNote: 'NASA media and data guidance applies; check item-specific media restrictions and credit requirements.',
      attribution: `${definition.attribution}${record.copyright?.trim() ? `; ${record.copyright.trim()}` : ''}`,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });
}

export function normalizeNasaApods(
  records: NasaApod[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return normalizeRecords(records, collectedAt, definition, normalizeNasaRecords);
}

export async function fetchNasaApods(
  fetcher: Fetcher = fetch,
  collectedAt = new Date().toISOString(),
  limit = MAX_SOURCE_RECORDS,
  apiKey = process.env.NASA_API_KEY,
): Promise<NasaApod[]> {
  validateLimit(limit);
  const collectedTimestamp = Date.parse(collectedAt);
  if (Number.isNaN(collectedTimestamp)) throw new Error('collectedAt must be a valid date.');
  const url = new URL(NASA_API);
  url.searchParams.set('api_key', apiKey?.trim() || 'DEMO_KEY');
  url.searchParams.set('start_date', new Date(cutoffTimestamp(collectedAt, RECENCY_WINDOW_DAYS)).toISOString().slice(0, 10));
  url.searchParams.set('end_date', new Date(collectedTimestamp).toISOString().slice(0, 10));
  const payload = await fetchJson<NasaApod | NasaApod[]>(fetcher, url.toString(), 'NASA');
  return (Array.isArray(payload) ? payload : [payload]).slice(0, limit);
}

export type WikimediaPage = {
  pageid?: number;
  ns?: number;
  title?: string;
  canonicalurl?: string;
  imageinfo?: Array<{
    timestamp?: string;
    url?: string;
    descriptionurl?: string;
    extmetadata?: {
      LicenseShortName?: { value?: string };
      Artist?: { value?: string };
    };
  }>;
};

type WikimediaResponse = { query?: { pages?: Record<string, WikimediaPage> } };

function normalizeWikimediaRecords(records: WikimediaPage[], collectedAt: string, definition: SourceDefinition): NormalizedIdea[] {
  return records.flatMap((record) => {
    const title = record.title?.replace(/^File:/i, '').trim();
    const info = record.imageinfo?.[0];
    const license = info?.extmetadata?.LicenseShortName?.value?.trim();
    const url = record.canonicalurl?.trim() || info?.descriptionurl?.trim();
    if (!record.pageid || !title || !license || !url || !/^https?:\/\//i.test(url)) return [];
    const normalized = normalizeSourceMetadata(definition, {
      id: String(record.pageid),
      title,
      url,
      publishedAt: info?.timestamp,
      category: 'Creative Tools',
      difficulty: 'Starter',
      technologies: ['Media', 'Wikimedia Commons'],
      datasetTools: 'Wikimedia Commons MediaWiki API',
      license,
      usageNote: 'Retain the item-specific Wikimedia Commons licence and creator attribution when reusing media.',
      attribution: `${definition.attribution}${info?.extmetadata?.Artist?.value?.trim() ? `; ${info.extmetadata.Artist.value.trim()}` : ''}`,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });
}

export function normalizeWikimediaPages(
  records: WikimediaPage[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return normalizeRecords(records, collectedAt, definition, normalizeWikimediaRecords);
}

export async function fetchWikimediaPages(
  fetcher: Fetcher = fetch,
  limit = MAX_SOURCE_RECORDS,
): Promise<WikimediaPage[]> {
  validateLimit(limit);
  const url = new URL(WIKIMEDIA_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', 'software OR technology');
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', String(limit));
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url|extmetadata|timestamp');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');
  const payload = await fetchJson<WikimediaResponse>(fetcher, url.toString(), 'Wikimedia');
  return Object.values(payload.query?.pages ?? {}).slice(0, limit);
}

export type DevArticle = {
  id?: number;
  title?: string;
  description?: string;
  url?: string;
  canonical_url?: string;
  published_at?: string;
  tag_list?: string[] | string;
  user?: { name?: string; username?: string };
};

function articleTags(article: DevArticle): string[] {
  const tags = Array.isArray(article.tag_list)
    ? article.tag_list
    : (article.tag_list ?? '').split(',').map((tag) => tag.trim());
  return ['Developer Community', ...tags].filter(Boolean).slice(0, 6);
}

function normalizeDevRecords(records: DevArticle[], collectedAt: string, definition: SourceDefinition): NormalizedIdea[] {
  return records.flatMap((record) => {
    const title = record.title?.trim();
    const url = (record.canonical_url || record.url)?.trim();
    if (!record.id || !title || !url || !/^https?:\/\//i.test(url)) return [];
    const normalized = normalizeSourceMetadata(definition, {
      id: String(record.id),
      title,
      summary: record.description,
      url,
      publishedAt: record.published_at,
      category: 'Developer Tools',
      difficulty: 'Intermediate',
      technologies: articleTags(record),
      datasetTools: 'DEV.to Articles API',
      usageNote: 'Keep article metadata and links only; article text and author rights remain with the author and platform.',
      attribution: `${definition.attribution}${record.user?.name || record.user?.username ? `; ${record.user.name || record.user.username}` : ''}`,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });
}

export function normalizeDevArticles(
  records: DevArticle[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return normalizeRecords(records, collectedAt, definition, normalizeDevRecords);
}

export async function fetchDevArticles(
  fetcher: Fetcher = fetch,
  limit = MAX_SOURCE_RECORDS,
): Promise<DevArticle[]> {
  validateLimit(limit);
  const url = new URL(DEV_TO_API);
  url.searchParams.set('per_page', String(limit));
  url.searchParams.set('top', String(RECENCY_WINDOW_DAYS));
  const payload = await fetchJson<DevArticle[]>(fetcher, url.toString(), 'DEV.to');
  return Array.isArray(payload) ? payload.slice(0, limit) : [];
}

export type StackOverflowQuestion = {
  question_id?: number;
  title?: string;
  link?: string;
  creation_date?: number;
  tags?: string[];
  is_answered?: boolean;
};

type StackOverflowResponse = { items?: StackOverflowQuestion[] };

function normalizeStackOverflowRecords(
  records: StackOverflowQuestion[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return records.flatMap((record) => {
    const title = record.title?.trim();
    if (!record.question_id || !title || !record.link || !/^https?:\/\//i.test(record.link) || !record.creation_date) return [];
    const normalized = normalizeSourceMetadata(definition, {
      id: String(record.question_id),
      title,
      url: record.link,
      publishedAt: new Date(record.creation_date * 1000).toISOString(),
      category: 'Developer Tools',
      difficulty: record.is_answered ? 'Intermediate' : 'Starter',
      technologies: ['Stack Overflow', ...(record.tags ?? [])],
      datasetTools: 'Stack Exchange API',
      usageNote: 'Question metadata is available under Stack Exchange API terms; user contributions remain CC BY-SA.',
      attribution: definition.attribution,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });
}

export function normalizeStackOverflowQuestions(
  records: StackOverflowQuestion[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return normalizeRecords(records, collectedAt, definition, normalizeStackOverflowRecords);
}

export async function fetchStackOverflowQuestions(
  fetcher: Fetcher = fetch,
  collectedAt = new Date().toISOString(),
  limit = MAX_SOURCE_RECORDS,
): Promise<StackOverflowQuestion[]> {
  validateLimit(limit);
  const collectedTimestamp = Date.parse(collectedAt);
  if (Number.isNaN(collectedTimestamp)) throw new Error('collectedAt must be a valid date.');
  const url = new URL(STACK_OVERFLOW_API);
  url.searchParams.set('site', 'stackoverflow');
  url.searchParams.set('fromdate', String(Math.floor(cutoffTimestamp(collectedAt, RECENCY_WINDOW_DAYS) / 1000)));
  url.searchParams.set('todate', String(Math.floor(collectedTimestamp / 1000)));
  url.searchParams.set('order', 'desc');
  url.searchParams.set('sort', 'creation');
  url.searchParams.set('pagesize', String(limit));
  const payload = await fetchJson<StackOverflowResponse>(fetcher, url.toString(), 'Stack Overflow');
  return Array.isArray(payload.items) ? payload.items.slice(0, limit) : [];
}

export type EuDataset = {
  id?: string;
  title?: string | Record<string, string>;
  description?: string | Record<string, string>;
  uri?: string;
  landingPage?: string;
  resource?: string;
  issued?: string;
  modified?: string;
  accessRights?: string;
  license?: string;
  publisher?: { name?: string };
};

type EuResponse = {
  result?: EuDataset[] | { datasets?: EuDataset[]; results?: EuDataset[]; items?: EuDataset[] };
  results?: EuDataset[];
  items?: EuDataset[];
  data?: EuDataset[];
  hits?: { hits?: Array<{ _source?: EuDataset }> };
};

function localizedValue(value: string | Record<string, string> | undefined): string | undefined {
  if (typeof value === 'string') return value;
  return value?.en || Object.values(value ?? {})[0];
}

function normalizeEuRecords(records: EuDataset[], collectedAt: string, definition: SourceDefinition): NormalizedIdea[] {
  return records.flatMap((record) => {
    const title = localizedValue(record.title as string | Record<string, string> | undefined)?.trim();
    const url = (record.landingPage || record.uri || record.resource)?.trim();
    const id = record.id?.trim() || url;
    if (!id || !title || !url || !/^https?:\/\//i.test(url)) return [];
    const normalized = normalizeSourceMetadata(definition, {
      id,
      title,
      summary: localizedValue(record.description as string | Record<string, string> | undefined),
      url,
      publishedAt: record.modified || record.issued,
      category: 'Data & Civic Tech',
      difficulty: 'Intermediate',
      technologies: ['Data', 'Open Data', ...(record.publisher?.name ? [record.publisher.name] : [])],
      datasetTools: 'data.europa.eu datasets API',
      license: record.license || record.accessRights,
      usageNote: 'Dataset-specific European data licences apply; preserve the dataset landing URL and licence.',
      attribution: `${definition.attribution}${record.publisher?.name ? `; ${record.publisher.name}` : ''}`,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });
}

export function normalizeEuDatasets(
  records: EuDataset[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  return normalizeRecords(records, collectedAt, definition, normalizeEuRecords);
}

export async function fetchEuDatasets(
  fetcher: Fetcher = fetch,
  limit = MAX_SOURCE_RECORDS,
): Promise<EuDataset[]> {
  validateLimit(limit);
  const url = new URL(EU_OPEN_DATA_API);
  url.searchParams.set('q', 'software');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('filters', 'dataset');
  const payload = await fetchJson<EuResponse>(fetcher, url.toString(), 'EU Open Data');
  const nestedResult = Array.isArray(payload.result)
    ? payload.result
    : payload.result?.datasets || payload.result?.results || payload.result?.items;
  const records = nestedResult || payload.results || payload.items || payload.data ||
    payload.hits?.hits?.flatMap((hit) => hit._source ? [hit._source] : []) || [];
  return records.slice(0, limit);
}
