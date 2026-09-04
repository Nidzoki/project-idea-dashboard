import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchHackerNewsStories,
  normalizeHackerNewsStories,
  validateNormalizedIdeas,
  type HackerNewsStory,
} from './hackerNewsPipeline';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutput = resolve(projectRoot, 'src/data/generated/hacker-news-ideas.json');
const fixturePath = resolve(projectRoot, 'scripts/fixtures/hacker-news-stories.json');

async function collect(): Promise<void> {
  const fixtureMode = process.argv.includes('--fixture');
  let stories: HackerNewsStory[];
  let collectedAt: string;

  if (fixtureMode) {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as {
      collectedAt: string;
      stories: HackerNewsStory[];
    };
    stories = fixture.stories;
    collectedAt = fixture.collectedAt;
  } else {
    stories = await fetchHackerNewsStories(fetch);
    collectedAt = new Date().toISOString();
  }

  const existingApprovals = await readExistingApprovals();
  const ideas = normalizeHackerNewsStories(stories, collectedAt).map((idea) => ({
    ...idea,
    approved: existingApprovals.get(idea.id) ?? false,
  }));
  validateNormalizedIdeas(ideas);
  await mkdir(dirname(defaultOutput), { recursive: true });
  await writeFile(defaultOutput, `${JSON.stringify(ideas, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${ideas.length} Hacker News ideas to ${defaultOutput}${fixtureMode ? ' (fixture)' : ''}.`);
}

async function readExistingApprovals(): Promise<Map<string, boolean>> {
  try {
    const existing = JSON.parse(await readFile(defaultOutput, 'utf8')) as Array<{ id?: string; approved?: boolean }>;
    return new Map(existing.flatMap((idea) => idea.id ? [[idea.id, idea.approved === true] as const] : []));
  } catch {
    return new Map();
  }
}

collect().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
