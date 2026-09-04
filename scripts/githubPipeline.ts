import type { NormalizedIdea } from '../src/types';
import { deduplicateIdeas } from './hackerNewsPipeline';
import type { SourceDefinition } from './sourceCatalog';
import { normalizeSourceMetadata } from './sourceNormalization';
import { cutoffTimestamp, RECENCY_WINDOW_DAYS } from './retentionPolicy';

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_USAGE_NOTE =
  'Repository metadata is collected from the GitHub REST API; review the repository licence and GitHub API terms before reuse.';

export type GitHubRepository = {
  id: number;
  full_name?: string;
  name?: string;
  description?: string | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  language?: string | null;
  topics?: string[];
  fork?: boolean;
  archived?: boolean;
  owner?: { login?: string };
  license?: {
    key?: string;
    name?: string | null;
    spdx_id?: string | null;
    url?: string | null;
  } | null;
};

type GitHubSearchResponse = {
  items?: GitHubRepository[];
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function licenseName(repository: GitHubRepository): string | null {
  const license = repository.license;
  if (!license || license.spdx_id === 'NOASSERTION') return null;
  return license.spdx_id?.trim() || license.name?.trim() || null;
}

function repositoryTechnologies(repository: GitHubRepository): string[] {
  return [...new Set([
    ...(repository.language ? [repository.language] : []),
    ...(repository.topics ?? []),
  ])].filter(Boolean).slice(0, 6);
}

export function normalizeGitHubRepositories(
  repositories: GitHubRepository[],
  collectedAt: string,
  definition: SourceDefinition,
): NormalizedIdea[] {
  const ideas = repositories.flatMap((repository) => {
    const license = licenseName(repository);
    const title = repository.full_name?.trim() || repository.name?.trim();
    if (
      !Number.isInteger(repository.id) ||
      !title ||
      !repository.html_url ||
      !/^https?:\/\//i.test(repository.html_url) ||
      !repository.created_at ||
      repository.archived ||
      repository.fork ||
      !license
    ) {
      return [];
    }

    const normalized = normalizeSourceMetadata(definition, {
      id: String(repository.id),
      title,
      summary: repository.description?.trim(),
      url: repository.html_url,
      publishedAt: repository.created_at,
      category: 'Developer Tools',
      difficulty: 'Intermediate',
      technologies: repositoryTechnologies(repository),
      datasetTools: 'GitHub REST API',
      license,
      usageNote: GITHUB_USAGE_NOTE,
      attribution: `GitHub and ${repository.owner?.login?.trim() || title} repository authors`,
    }, collectedAt);
    return normalized ? [normalized] : [];
  });

  return deduplicateIdeas(ideas);
}

export async function fetchGitHubRepositories(
  fetcher: Fetcher = fetch,
  collectedAt = new Date().toISOString(),
  perPage = 20,
  token = process.env.GITHUB_TOKEN,
): Promise<GitHubRepository[]> {
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new Error('perPage must be an integer between 1 and 100.');
  }
  const cutoff = new Date(cutoffTimestamp(collectedAt, RECENCY_WINDOW_DAYS)).toISOString().slice(0, 10);
  const url = new URL(`${GITHUB_API}/search/repositories`);
  url.searchParams.set('q', `created:>=${cutoff}`);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(perPage));
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'IdeaAtlas/1.0',
    'x-github-api-version': '2022-11-28',
  };
  if (token?.trim()) headers.authorization = ['Bearer', token.trim()].join(' ');
  const response = await fetcher(url.toString(), { headers });
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}).`);
  const payload = await response.json() as GitHubSearchResponse;
  return Array.isArray(payload.items) ? payload.items : [];
}
