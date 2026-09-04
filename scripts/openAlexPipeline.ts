import type { NormalizedIdea } from '../src/types';
import { deduplicateIdeas } from './hackerNewsPipeline';
import type { SourceDefinition } from './sourceCatalog';
import { normalizeSourceMetadata } from './sourceNormalization';
import { cutoffTimestamp, RECENCY_WINDOW_DAYS } from './retentionPolicy';

export const OPENALEX_API = 'https://api.openalex.org/works';
export const OPENALEX_USAGE_NOTE =
  'Bibliographic metadata is collected from OpenAlex; do not republish article full text and retain the cited-work attribution.';

export type OpenAlexWork = {
  id?: string;
  display_name?: string;
  publication_date?: string;
  type?: string;
  is_retracted?: boolean;
  is_paratext?: boolean;
  cited_by_count?: number;
  primary_topic?: { display_name?: string | null };
  topics?: Array<{ display_name?: string | null }>;
  concepts?: Array<{ display_name?: string | null }>;
};

type OpenAlexResponse = {
  results?: OpenAlexWork[];
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function workTechnologies(work: OpenAlexWork): string[] {
  const topics = [
    work.primary_topic?.display_name,
    ...(work.topics ?? []).map((topic) => topic.display_name),
    ...(work.concepts ?? []).map((concept) => concept.display_name),
  ].filter((value): value is string => Boolean(value?.trim()));
  return [...new Set(['Research', ...topics])].slice(0, 6);
}

export function normalizeOpenAlexWorks(
  works: OpenAlexWork[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  const ideas = works.flatMap((work) => {
    if (
      !work.id ||
      !/^https?:\/\//i.test(work.id) ||
      !work.display_name?.trim() ||
      !work.publication_date ||
      work.is_retracted ||
      work.is_paratext
    ) {
      return [];
    }
    const normalized = normalizeSourceMetadata(definition, {
      id: work.id.split('/').pop() ?? work.id,
      title: work.display_name.trim(),
      url: work.id,
      publishedAt: work.publication_date,
      category: 'Research & Learning',
      technologies: workTechnologies(work),
      datasetTools: 'OpenAlex Works API',
      license: definition.license,
      usageNote: OPENALEX_USAGE_NOTE,
      attribution: `${definition.attribution}; cited works retain their own rights`,
    }, collectedAt);
    return normalized ? [{ ...normalized, difficulty: 'Advanced' as const }] : [];
  });

  return deduplicateIdeas(ideas);
}

export async function fetchOpenAlexWorks(
  fetcher: Fetcher = fetch,
  collectedAt = new Date().toISOString(),
  perPage = 20,
): Promise<OpenAlexWork[]> {
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new Error('perPage must be an integer between 1 and 100.');
  }
  const collectedTimestamp = Date.parse(collectedAt);
  if (Number.isNaN(collectedTimestamp)) throw new Error('collectedAt must be a valid date.');
  const cutoff = new Date(cutoffTimestamp(collectedAt, RECENCY_WINDOW_DAYS)).toISOString().slice(0, 10);
  const today = new Date(collectedTimestamp).toISOString().slice(0, 10);
  const url = new URL(OPENALEX_API);
  url.searchParams.set('filter', `from_publication_date:${cutoff},to_publication_date:${today}`);
  url.searchParams.set('search', 'software development');
  url.searchParams.set('sort', 'cited_by_count:desc');
  url.searchParams.set('per-page', String(perPage));
  const response = await fetcher(url.toString(), {
    headers: {
      accept: 'application/json',
      'user-agent': 'IdeaAtlas/1.0',
    },
  });
  if (!response.ok) throw new Error(`OpenAlex API request failed (${response.status}).`);
  const payload = await response.json() as OpenAlexResponse;
  return Array.isArray(payload.results) ? payload.results : [];
}
