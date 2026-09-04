import { describe, expect, it } from 'vitest';
import { createAttributionManifest } from './attribution';
import { classifyIdea } from './deterministicClassification';
import {
  createSourceAdapters,
  fetchGitHubRepositories,
  fetchOpenAlexWorks,
  normalizeGitHubRepositories,
  normalizeOpenAlexWorks,
  normalizeSourceMetadata,
} from './sourceAdapters';
import { SOURCE_CATALOG } from './sourceCatalog';
import type { NormalizedIdea } from '../src/types';
import githubFixture from './fixtures/github-repositories.json';
import openAlexFixture from './fixtures/openalex-works.json';
import safePublicApiFixture from './fixtures/safe-public-apis.json';

const idea: NormalizedIdea = {
  id: 'demo-1',
  title: 'A public data map for local climate projects',
  summary: 'Help curious builders explore open datasets and publish a small map.',
  category: 'General',
  difficulty: 'Starter',
  technologies: ['Web'],
  source: 'Demo',
  datasetTools: 'Open data API',
  whyBuildIt: 'Make a public dataset easier to understand.',
  suggestedSteps: ['Choose a dataset', 'Build a small view', 'Ask a user to try it'],
  color: 'blue',
  sourceId: 'data-gov',
  sourceName: 'Data.gov',
  sourceUrl: 'https://example.com/data',
  license: 'Dataset-specific',
  usageNote: 'Keep attribution.',
  attribution: 'Data.gov',
  collectedAt: '2026-01-01T00:00:00.000Z',
  approved: false,
};

describe('source-neutral pipeline configuration', () => {
  it('registers every selected source without enabling browser scraping', () => {
    const adapters = createSourceAdapters();
    expect(adapters.map((adapter) => adapter.definition.id)).toEqual(SOURCE_CATALOG.map((source) => source.id));
    expect(SOURCE_CATALOG.filter((source) => source.status === 'manual-license-review')).toHaveLength(3);
    expect(SOURCE_CATALOG.filter((source) => source.status === 'ready').map((source) => source.id)).toEqual([
      'hacker-news',
      'github',
      'data-gov',
      'world-bank',
      'nasa',
      'openalex',
      'wikimedia',
      'dev-to',
      'stack-overflow',
      'eu-open-data',
    ]);
  });

  it('classifies ideas deterministically and produces source attribution', () => {
    const first = classifyIdea(idea);
    const second = classifyIdea(idea);
    expect(first).toEqual(second);
    expect(first.category).toBe('Data & Civic Tech');
    expect(first.technologies).toContain('Data');
    expect(first.recommendation).toBe('build');

    const manifest = createAttributionManifest([{ ...first }], '2026-01-02T00:00:00.000Z');
    expect(manifest.sources.find((source) => source.id === 'data-gov')).toMatchObject({
      ideaCount: 1,
      ideaIds: ['demo-1'],
    });
  });

  it('normalizes shared fields and applies the seven-day collection window', () => {
    const source = SOURCE_CATALOG.find((candidate) => candidate.id === 'world-bank');
    expect(source).toBeDefined();
    const normalized = normalizeSourceMetadata(source!, {
      id: 'indicator-1',
      title: 'A public health indicator',
      url: 'https://api.example.test/indicator-1',
      publishedAt: '2026-08-28T00:00:00.000Z',
      technologies: ['Data', 'Data'],
    }, '2026-09-01T00:00:00.000Z');
    expect(normalized).toMatchObject({
      id: 'world-bank-indicator-1',
      sourceId: 'world-bank',
      license: source!.license,
      technologies: ['Data'],
    });
    expect(normalizeSourceMetadata(source!, {
      id: 'old',
      title: 'Too old',
      url: 'https://api.example.test/old',
      publishedAt: '2024-01-01T00:00:00.000Z',
    }, '2026-09-01T00:00:00.000Z')).toBeNull();
  });

  it('normalizes licensed GitHub repositories and excludes stale or unlicensed records', () => {
    const source = SOURCE_CATALOG.find((candidate) => candidate.id === 'github');
    expect(source?.status).toBe('ready');
    const ideas = normalizeGitHubRepositories(
      githubFixture,
      '2026-01-01T00:00:00.000Z',
      source!,
    );
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({
      id: 'github-701',
      title: 'example/project-notebook',
      sourceUrl: 'https://github.com/example/project-notebook',
      license: 'MIT',
      attribution: 'GitHub and example repository authors',
      publishedAt: '2025-12-30T00:00:00Z',
    });
  });

  it('normalizes recent OpenAlex works without copying abstracts or full text', () => {
    const source = SOURCE_CATALOG.find((candidate) => candidate.id === 'openalex');
    expect(source?.status).toBe('ready');
    const ideas = normalizeOpenAlexWorks(openAlexFixture, '2026-01-01T00:00:00.000Z', source!);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({
      id: 'openalex-W701',
      sourceUrl: 'https://openalex.org/W701',
      source: 'OpenAlex',
      technologies: ['Research', 'Software Engineering', 'Human-Computer Interaction'],
    });
    expect(ideas[0].summary).not.toContain('abstract');
  });

  it('uses one official request per live adapter and keeps credentials optional', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ items: [] }) } as Response;
    };
    await fetchGitHubRepositories(fetcher, '2026-01-01T00:00:00.000Z', 5, 'test-token');
    expect(requests[0].url).toContain('created%3A%3E%3D2025-12-25');
    expect((requests[0].init?.headers as Record<string, string>).authorization).toBe('Bearer test-token');

    requests.length = 0;
    await fetchOpenAlexWorks(fetcher, '2026-01-01T00:00:00.000Z', 5);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('from_publication_date%3A2025-12-25');
    expect((requests[0].init?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('normalizes the safe public API fixture records with source-specific provenance', async () => {
    const adapters = createSourceAdapters();
    const fixtures = safePublicApiFixture as typeof safePublicApiFixture;
    const contexts = [
      ['data-gov', 'fixtureDataGovPackages', fixtures.dataGovPackages],
      ['world-bank', 'fixtureWorldBankIndicators', fixtures.worldBankIndicators],
      ['nasa', 'fixtureNasaApods', fixtures.nasaApods],
      ['wikimedia', 'fixtureWikimediaPages', fixtures.wikimediaPages],
      ['dev-to', 'fixtureDevArticles', fixtures.devArticles],
      ['stack-overflow', 'fixtureStackOverflowQuestions', fixtures.stackOverflowQuestions],
      ['eu-open-data', 'fixtureEuDatasets', fixtures.euDatasets],
    ] as const;

    for (const [sourceId, fixtureKey, records] of contexts) {
      const result = await adapters.find((adapter) => adapter.definition.id === sourceId)!.collect({
        collectedAt: '2026-01-01T00:00:00.000Z',
        [fixtureKey]: records,
      } as never);
      expect(result.status).toBe('ready');
      expect(result.ideas).toHaveLength(1);
      expect(result.ideas[0].sourceId).toBe(sourceId);
      expect(result.ideas[0].sourceUrl).toMatch(/^https?:\/\//);
      expect(result.ideas[0].license).toBeTruthy();
    }
  });
});
