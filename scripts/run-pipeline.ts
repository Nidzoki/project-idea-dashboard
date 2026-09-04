import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAttributionManifest } from './attribution';
import { classifyIdeas } from './deterministicClassification';
import { createSourceAdapters } from './sourceAdapters';
import { validateNormalizedIdeas } from './hackerNewsPipeline';
import type { NormalizedIdea } from '../src/types';
import type { HackerNewsStory } from './hackerNewsPipeline';
import { isWithinRetentionWindow } from './retentionPolicy';
import type {
  DataGovPackage,
  DevArticle,
  EuDataset,
  GitHubRepository,
  NasaApod,
  OpenAlexWork,
  StackOverflowQuestion,
  WikimediaPage,
  WorldBankIndicator,
} from './sourceAdapters';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePaths = {
  hackerNews: resolve(projectRoot, 'scripts/fixtures/hacker-news-stories.json'),
  github: resolve(projectRoot, 'scripts/fixtures/github-repositories.json'),
  openAlex: resolve(projectRoot, 'scripts/fixtures/openalex-works.json'),
  safePublicApis: resolve(projectRoot, 'scripts/fixtures/safe-public-apis.json'),
};
const ideasOutput = resolve(projectRoot, 'src/data/generated/pipeline-ideas.json');
const manifestOutput = resolve(projectRoot, 'src/data/generated/attribution-manifest.json');

export function assertNoSecrets(value: string): void {
  const secretPatterns = [
    /gh[pousr]_[A-Za-z0-9_]{20,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b(?:sk|rk)-[A-Za-z0-9]{20,}\b/,
    /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i,
  ];
  if (secretPatterns.some((pattern) => pattern.test(value))) {
    throw new Error('Generated output looks like it contains a secret; refusing to continue.');
  }
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
}

function parseSources(): string[] {
  const value = process.argv.find((argument) => argument.startsWith('--sources='));
  return value ? value.slice('--sources='.length).split(',').map((source) => source.trim()).filter(Boolean) : [];
}

async function loadFixture(): Promise<{
  collectedAt: string;
  stories: HackerNewsStory[];
  repositories: GitHubRepository[];
  works: OpenAlexWork[];
  dataGovPackages: DataGovPackage[];
  worldBankIndicators: WorldBankIndicator[];
  nasaApods: NasaApod[];
  wikimediaPages: WikimediaPage[];
  devArticles: DevArticle[];
  stackOverflowQuestions: StackOverflowQuestion[];
  euDatasets: EuDataset[];
}> {
  const [hackerNews, github, openAlex, safePublicApis] = await Promise.all([
    readFile(fixturePaths.hackerNews, 'utf8'),
    readFile(fixturePaths.github, 'utf8'),
    readFile(fixturePaths.openAlex, 'utf8'),
    readFile(fixturePaths.safePublicApis, 'utf8'),
  ]);
  const hackerNewsFixture = JSON.parse(hackerNews) as { collectedAt: string; stories: HackerNewsStory[] };
  const safeFixture = JSON.parse(safePublicApis) as {
    dataGovPackages: DataGovPackage[];
    worldBankIndicators: WorldBankIndicator[];
    nasaApods: NasaApod[];
    wikimediaPages: WikimediaPage[];
    devArticles: DevArticle[];
    stackOverflowQuestions: StackOverflowQuestion[];
    euDatasets: EuDataset[];
  };
  return {
    collectedAt: hackerNewsFixture.collectedAt,
    stories: hackerNewsFixture.stories,
    repositories: JSON.parse(github) as GitHubRepository[],
    works: JSON.parse(openAlex) as OpenAlexWork[],
    ...safeFixture,
  };
}

function preserveApprovals(ideas: NormalizedIdea[], previous: NormalizedIdea[]): NormalizedIdea[] {
  const approvals = new Map(previous.map((idea) => [idea.id, idea.approved]));
  return ideas.map((idea) => ({ ...idea, approved: approvals.get(idea.id) ?? false }));
}

async function readPreviousIdeas(): Promise<NormalizedIdea[]> {
  try {
    return JSON.parse(await readFile(ideasOutput, 'utf8')) as NormalizedIdea[];
  } catch {
    return [];
  }
}

function runSafetyChecks(): void {
  if (process.env.ALLOW_AUTO_PUSH !== 'true') {
    throw new Error('Auto-push is disabled. Set ALLOW_AUTO_PUSH=true and pass --push explicitly.');
  }
  const expectedBranch = process.env.PUSH_BRANCH;
  const currentBranch = git('branch', '--show-current');
  if (!expectedBranch || expectedBranch !== currentBranch) {
    throw new Error(`Branch guard failed: current=${currentBranch || '(detached)'}, expected=${expectedBranch || '(unset)'}.`);
  }
  if (git('status', '--porcelain')) {
    throw new Error('Working tree must be clean before a guarded auto-push.');
  }
  execFileSync(npmCommand(), ['test', '--', '--run'], { cwd: projectRoot, stdio: 'inherit' });
}

export async function runPipeline(): Promise<void> {
  const fixtureMode = process.argv.includes('--fixture');
  const pushRequested = process.argv.includes('--push');
  const collectedAt = new Date().toISOString();
  const fixture = fixtureMode ? await loadFixture() : undefined;
  const runCollectedAt = fixture?.collectedAt ?? collectedAt;
  const selectedSources = parseSources();
  const adapters = createSourceAdapters().filter((adapter) =>
    selectedSources.length === 0 || selectedSources.includes(adapter.definition.id),
  );

  if (pushRequested) runSafetyChecks();

  const results = await Promise.all(adapters.map(async (adapter) => {
    try {
      return await adapter.collect({
        collectedAt: runCollectedAt,
        fixture: fixtureMode,
        fixtureStories: adapter.definition.id === 'hacker-news' ? fixture?.stories : undefined,
        fixtureGitHubRepositories: adapter.definition.id === 'github' ? fixture?.repositories : undefined,
        fixtureOpenAlexWorks: adapter.definition.id === 'openalex' ? fixture?.works : undefined,
        fixtureDataGovPackages: adapter.definition.id === 'data-gov' ? fixture?.dataGovPackages : undefined,
        fixtureWorldBankIndicators: adapter.definition.id === 'world-bank' ? fixture?.worldBankIndicators : undefined,
        fixtureNasaApods: adapter.definition.id === 'nasa' ? fixture?.nasaApods : undefined,
        fixtureWikimediaPages: adapter.definition.id === 'wikimedia' ? fixture?.wikimediaPages : undefined,
        fixtureDevArticles: adapter.definition.id === 'dev-to' ? fixture?.devArticles : undefined,
        fixtureStackOverflowQuestions: adapter.definition.id === 'stack-overflow' ? fixture?.stackOverflowQuestions : undefined,
        fixtureEuDatasets: adapter.definition.id === 'eu-open-data' ? fixture?.euDatasets : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        sourceId: adapter.definition.id,
        status: 'unavailable' as const,
        ideas: [],
        message: `API failure: ${message}`,
      };
    }
  }));
  const previous = await readPreviousIdeas();
  const freshIdeas = results.flatMap((result) => result.ideas)
    .filter((idea) => isWithinRetentionWindow(idea.publishedAt ?? idea.collectedAt, runCollectedAt));
  const ideas = preserveApprovals(classifyIdeas(freshIdeas), previous);
  validateNormalizedIdeas(ideas);
  const manifest = createAttributionManifest(ideas, collectedAt);
  const ideasText = `${JSON.stringify(ideas, null, 2)}\n`;
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  assertNoSecrets(`${ideasText}\n${manifestText}`);

  await mkdir(dirname(ideasOutput), { recursive: true });
  await writeFile(ideasOutput, ideasText, 'utf8');
  await writeFile(manifestOutput, manifestText, 'utf8');

  for (const result of results) console.log(`[${result.status}] ${result.sourceId}: ${result.message}`);
  console.log(`Wrote ${ideas.length} normalized ideas and an attribution manifest.`);

  if (pushRequested) {
    execFileSync('git', ['add', ideasOutput, manifestOutput], { cwd: projectRoot, stdio: 'inherit' });
    execFileSync('git', [
      'commit',
      '-m',
      'chore: refresh generated idea data',
      '-m',
      'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
    ], { cwd: projectRoot, stdio: 'inherit' });
    execFileSync('git', ['push', 'origin', process.env.PUSH_BRANCH as string], { cwd: projectRoot, stdio: 'inherit' });
  } else {
    console.log('Dry run: no commit or push was attempted.');
  }
}
