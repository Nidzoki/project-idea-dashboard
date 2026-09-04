import type { NormalizedIdea } from '../src/types';
import { cutoffTimestamp, RECENCY_WINDOW_DAYS } from './retentionPolicy';

export const HACKER_NEWS_API = 'https://hacker-news.firebaseio.com/v0';
export const HACKER_NEWS_USAGE_NOTE =
  'Story metadata is collected from the public Hacker News API; linked content remains owned by its authors.';
export const HACKER_NEWS_LICENSE = 'Hacker News public API (see usage note)';

export type HackerNewsFeed = 'ask' | 'show';

export type HackerNewsStory = {
  id: number;
  title?: string;
  text?: string;
  url?: string;
  by?: string;
  time?: number;
  type?: string;
  dead?: boolean;
  deleted?: boolean;
  feed: HackerNewsFeed;
};

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const technologyHints = [
  ['Next.js', /\bnext(?:\.js)?\b/i],
  ['React', /\breact\b/i],
  ['TypeScript', /\btypescript\b/i],
  ['JavaScript', /\bjavascript\b/i],
  ['Python', /\bpython\b/i],
  ['Rust', /\brust\b/i],
  ['Go', /\bgo(lang)?\b/i],
  ['Node.js', /\bnode(?:\.js)?\b/i],
  ['Postgres', /\bpostgres(?:ql)?\b/i],
  ['SQLite', /\bsqlite\b/i],
  ['AI', /\b(?:ai|llm|gpt|machine learning)\b/i],
  ['API', /\bapi\b/i],
  ['CLI', /\bcli\b/i],
  ['WebSockets', /\bwebsocket(?:s)?\b/i],
  ['Docker', /\bdocker\b/i],
  ['CSS', /\bcss\b/i],
] as const;

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleWithoutPrefix(title: string): string {
  return title.replace(/^(?:ask|show)\s+hn\s*:\s*/i, '').trim();
}

function titleKey(title: string): string {
  return titleWithoutPrefix(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function getTechnologies(text: string): string[] {
  const technologies = technologyHints
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  return technologies.length > 0 ? technologies.slice(0, 5) : ['Web'];
}

function createSummary(story: HackerNewsStory, title: string): string {
  const text = story.text ? stripHtml(story.text) : '';
  if (text) return text.length > 240 ? `${text.slice(0, 237).trimEnd()}...` : text;
  return story.feed === 'show'
    ? `A product or experiment shared with the Hacker News community: ${title}.`
    : `A problem or opportunity discussed by the Hacker News community: ${title}.`;
}

export function normalizeHackerNewsStories(
  stories: HackerNewsStory[],
  collectedAt: string,
): NormalizedIdea[] {
  const candidates: NormalizedIdea[] = [];
  const cutoff = cutoffTimestamp(collectedAt, RECENCY_WINDOW_DAYS);

  for (const story of stories) {
    if (
      !Number.isInteger(story.id) ||
      !story.title?.trim() ||
      !['ask', 'show'].includes(story.feed) ||
      !/^(?:ask|show)\s+hn\s*:/i.test(story.title) ||
      story.type === 'job' ||
      story.dead ||
      story.deleted
    ) {
      continue;
    }
    if (typeof story.time !== 'number' || story.time * 1000 < cutoff) continue;

    const title = titleWithoutPrefix(story.title);
    const isShow = story.feed === 'show';
    const sourceUrl = `https://news.ycombinator.com/item?id=${story.id}`;
    const searchableText = `${title} ${story.text ?? ''} ${story.url ?? ''}`;

    candidates.push({
      id: `hn-${story.id}`,
      title,
      summary: createSummary(story, title),
      category: isShow ? 'Developer Tools' : 'Community',
      difficulty: isShow ? 'Intermediate' : 'Starter',
      technologies: getTechnologies(searchableText),
      source: `Hacker News · ${isShow ? 'Show HN' : 'Ask HN'}`,
      datasetTools: 'Hacker News public API',
      whyBuildIt: isShow
        ? 'Study a real launch, then turn the underlying problem into a focused build.'
        : 'Turn a clearly described community problem into a small, testable product direction.',
      suggestedSteps: isShow
        ? ['Read the original launch post and identify its smallest promise', 'Define a focused first version', 'Test the workflow with a few target users']
        : ['Rewrite the problem as one user outcome', 'Sketch the smallest useful workflow', 'Validate the idea with the people who experience it'],
      color: isShow ? 'blue' : 'green',
      sourceId: 'hacker-news',
      sourceName: 'Hacker News',
      sourceUrl,
      license: HACKER_NEWS_LICENSE,
      usageNote: HACKER_NEWS_USAGE_NOTE,
      attribution: 'Hacker News / Y Combinator; linked content remains owned by its authors.',
      collectedAt,
      approved: false,
    });
  }

  return deduplicateIdeas(candidates);
}

export function deduplicateIdeas(ideas: NormalizedIdea[]): NormalizedIdea[] {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();

  return ideas.filter((idea) => {
    const key = titleKey(idea.title);
    if (seenIds.has(idea.id) || seenTitles.has(key)) return false;
    seenIds.add(idea.id);
    seenTitles.add(key);
    return true;
  });
}

export function validateNormalizedIdeas(value: unknown): asserts value is NormalizedIdea[] {
  if (!Array.isArray(value)) throw new Error('Generated ideas must be an array.');

  const ids = new Set<string>();
  for (const [index, idea] of value.entries()) {
    if (!idea || typeof idea !== 'object') throw new Error(`Idea ${index} must be an object.`);
    const candidate = idea as Partial<NormalizedIdea>;
    const requiredStrings = [
      'id',
      'title',
      'summary',
      'category',
      'source',
      'datasetTools',
      'whyBuildIt',
      'sourceUrl',
      'license',
      'usageNote',
      'collectedAt',
    ] as const;

    for (const field of requiredStrings) {
      if (typeof candidate[field] !== 'string' || !candidate[field].trim()) {
        throw new Error(`Idea ${index} has an invalid ${field}.`);
      }
    }

    const id = candidate.id as string;
    if (ids.has(id)) throw new Error(`Duplicate idea id: ${id}`);
    ids.add(id);
    if (!['Starter', 'Intermediate', 'Advanced'].includes(candidate.difficulty ?? '')) {
      throw new Error(`Idea ${index} has an invalid difficulty.`);
    }
    if (!Array.isArray(candidate.technologies) || candidate.technologies.length === 0) {
      throw new Error(`Idea ${index} must include technologies.`);
    }
    if (!Array.isArray(candidate.suggestedSteps) || candidate.suggestedSteps.length === 0) {
      throw new Error(`Idea ${index} must include suggested steps.`);
    }
    if (!['blue', 'purple', 'orange', 'green'].includes(candidate.color ?? '')) {
      throw new Error(`Idea ${index} has an invalid color.`);
    }
    try {
      const sourceUrl = new URL(candidate.sourceUrl as string);
      if (!['http:', 'https:'].includes(sourceUrl.protocol)) throw new Error();
    } catch {
      throw new Error(`Idea ${index} has an invalid sourceUrl.`);
    }
    if (Number.isNaN(Date.parse(candidate.collectedAt as string))) {
      throw new Error(`Idea ${index} has an invalid collectedAt.`);
    }
    if (typeof candidate.approved !== 'boolean') {
      throw new Error(`Idea ${index} has an invalid approved flag.`);
    }
    if (candidate.decision !== undefined && !['keep', 'discard'].includes(candidate.decision)) {
      throw new Error(`Idea ${index} has an invalid enrichment decision.`);
    }
    if (candidate.decision === 'discard' &&
      (typeof candidate.discardReason !== 'string' || !candidate.discardReason.trim())) {
      throw new Error(`Idea ${index} has an invalid discard reason.`);
    }
    if (candidate.sourceId !== undefined && typeof candidate.sourceId !== 'string') {
      throw new Error(`Idea ${index} has an invalid sourceId.`);
    }
    if (candidate.qualityScore !== undefined &&
      (typeof candidate.qualityScore !== 'number' || candidate.qualityScore < 0 || candidate.qualityScore > 100)) {
      throw new Error(`Idea ${index} has an invalid qualityScore.`);
    }
    if (candidate.recommendation !== undefined &&
      !['build', 'consider', 'research'].includes(candidate.recommendation)) {
      throw new Error(`Idea ${index} has an invalid recommendation.`);
    }
  }
}

async function fetchJson<T>(fetcher: Fetcher, url: string): Promise<T> {
  const response = await fetcher(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Hacker News API request failed (${response.status}): ${url}`);
  return response.json() as Promise<T>;
}

export async function fetchHackerNewsStories(
  fetcher: Fetcher = fetch,
  storiesPerFeed = 20,
): Promise<HackerNewsStory[]> {
  if (!Number.isInteger(storiesPerFeed) || storiesPerFeed < 1) {
    throw new Error('storiesPerFeed must be a positive integer.');
  }

  const feeds: Array<[HackerNewsFeed, string]> = [
    ['ask', `${HACKER_NEWS_API}/askstories.json`],
    ['show', `${HACKER_NEWS_API}/showstories.json`],
  ];
  const stories = await Promise.all(
    feeds.map(async ([feed, feedUrl]) => {
      const ids = await fetchJson<number[]>(fetcher, feedUrl);
      const selectedIds = ids.filter((id) => Number.isInteger(id)).slice(0, storiesPerFeed);
      return Promise.all(
        selectedIds.map(async (id) => {
          const story = await fetchJson<Omit<HackerNewsStory, 'feed'>>(fetcher, `${HACKER_NEWS_API}/item/${id}.json`);
          return { ...story, feed };
        }),
      );
    }),
  );
  return stories.flat();
}
