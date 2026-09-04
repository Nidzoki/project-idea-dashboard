import type { NormalizedIdea } from '../src/types';
import {
  fetchHackerNewsStories,
  normalizeHackerNewsStories,
  type HackerNewsStory,
} from './hackerNewsPipeline';
import {
  fetchGitHubRepositories,
  normalizeGitHubRepositories,
  type GitHubRepository,
} from './githubPipeline';
import {
  fetchOpenAlexWorks,
  normalizeOpenAlexWorks,
  type OpenAlexWork,
} from './openAlexPipeline';
import {
  fetchDataGovPackages,
  fetchDevArticles,
  fetchEuDatasets,
  fetchNasaApods,
  fetchStackOverflowQuestions,
  fetchWikimediaPages,
  fetchWorldBankIndicators,
  normalizeDataGovPackages,
  normalizeDevArticles,
  normalizeEuDatasets,
  normalizeNasaApods,
  normalizeStackOverflowQuestions,
  normalizeWikimediaPages,
  normalizeWorldBankIndicators,
  MAX_SOURCE_RECORDS,
  type DataGovPackage,
  type DevArticle,
  type EuDataset,
  type NasaApod,
  type StackOverflowQuestion,
  type WikimediaPage,
  type WorldBankIndicator,
} from './safePublicApiPipelines';
import { getSourceDefinition, SOURCE_CATALOG, type SourceDefinition } from './sourceCatalog';
import { normalizeSourceMetadata, type SourceMetadataRecord } from './sourceNormalization';

export {
  fetchGitHubRepositories,
  normalizeGitHubRepositories,
  fetchOpenAlexWorks,
  normalizeOpenAlexWorks,
  fetchDataGovPackages,
  normalizeDataGovPackages,
  fetchWorldBankIndicators,
  normalizeWorldBankIndicators,
  fetchNasaApods,
  normalizeNasaApods,
  fetchWikimediaPages,
  normalizeWikimediaPages,
  fetchDevArticles,
  normalizeDevArticles,
  fetchStackOverflowQuestions,
  normalizeStackOverflowQuestions,
  fetchEuDatasets,
  normalizeEuDatasets,
  MAX_SOURCE_RECORDS,
  normalizeSourceMetadata,
};
export type {
  GitHubRepository,
  OpenAlexWork,
  SourceMetadataRecord,
  DataGovPackage,
  WorldBankIndicator,
  NasaApod,
  WikimediaPage,
  DevArticle,
  StackOverflowQuestion,
  EuDataset,
};

export type AdapterContext = {
  collectedAt: string;
  fixture?: boolean;
  fetcher?: (input: string, init?: RequestInit) => Promise<Response>;
  fixtureStories?: HackerNewsStory[];
  fixtureGitHubRepositories?: GitHubRepository[];
  fixtureOpenAlexWorks?: OpenAlexWork[];
  fixtureDataGovPackages?: DataGovPackage[];
  fixtureWorldBankIndicators?: WorldBankIndicator[];
  fixtureNasaApods?: NasaApod[];
  fixtureWikimediaPages?: WikimediaPage[];
  fixtureDevArticles?: DevArticle[];
  fixtureStackOverflowQuestions?: StackOverflowQuestion[];
  fixtureEuDatasets?: EuDataset[];
};

export type AdapterResult = {
  sourceId: string;
  status: SourceDefinition['status'] | 'skipped';
  ideas: NormalizedIdea[];
  message: string;
};

export type SourceAdapter = {
  definition: SourceDefinition;
  collect: (context: AdapterContext) => Promise<AdapterResult>;
};

function skippedResult(definition: SourceDefinition): AdapterResult {
  return {
    sourceId: definition.id,
    status: definition.status,
    ideas: [],
    message:
      definition.status === 'manual-license-review'
        ? 'Skipped: manual licence/policy review is required before activation.'
        : 'Configured in the source catalog; adapter activation is intentionally deferred.',
  };
}

const hackerNewsAdapter: SourceAdapter = {
  definition: getSourceDefinition('hacker-news'),
  async collect(context) {
    const stories = context.fixtureStories ??
      (await fetchHackerNewsStories(context.fetcher ?? fetch));
    return {
      sourceId: 'hacker-news',
      status: 'ready',
      ideas: normalizeHackerNewsStories(stories, context.collectedAt).slice(0, MAX_SOURCE_RECORDS),
      message: `Normalized ${stories.length} public Hacker News story records.`,
    };
  },
};

const githubAdapter: SourceAdapter = {
  definition: getSourceDefinition('github'),
  async collect(context) {
    const repositories = context.fixtureGitHubRepositories ??
      (await fetchGitHubRepositories(context.fetcher ?? fetch, context.collectedAt));
    return {
      sourceId: 'github',
      status: 'ready',
      ideas: normalizeGitHubRepositories(repositories, context.collectedAt, githubAdapter.definition).slice(0, MAX_SOURCE_RECORDS),
      message: `Normalized GitHub repository metadata from ${repositories.length} records.`,
    };
  },
};

const openAlexAdapter: SourceAdapter = {
  definition: getSourceDefinition('openalex'),
  async collect(context) {
    const works = context.fixtureOpenAlexWorks ??
      (await fetchOpenAlexWorks(context.fetcher ?? fetch, context.collectedAt));
    return {
      sourceId: 'openalex',
      status: 'ready',
      ideas: normalizeOpenAlexWorks(works, context.collectedAt, openAlexAdapter.definition).slice(0, MAX_SOURCE_RECORDS),
      message: `Normalized OpenAlex bibliographic metadata from ${works.length} records.`,
    };
  },
};

function createOfficialAdapter<T>(
  sourceId: string,
  fixtureKey: keyof AdapterContext,
  fetchRecords: (context: AdapterContext) => Promise<T[]>,
  normalizeRecords: (records: T[], collectedAt: string, definition: SourceDefinition) => NormalizedIdea[],
): SourceAdapter {
  const definition = getSourceDefinition(sourceId);
  return {
    definition,
    async collect(context) {
      const fixtureRecords = context[fixtureKey];
      const records = Array.isArray(fixtureRecords)
        ? fixtureRecords as T[]
        : await fetchRecords(context);
      return {
        sourceId,
        status: 'ready',
        ideas: normalizeRecords(records, context.collectedAt, definition).slice(0, MAX_SOURCE_RECORDS),
        message: `Normalized ${definition.name} metadata from ${records.length} records.`,
      };
    },
  };
}

const dataGovAdapter = createOfficialAdapter(
  'data-gov',
  'fixtureDataGovPackages',
  (context) => fetchDataGovPackages(context.fetcher ?? fetch, MAX_SOURCE_RECORDS),
  normalizeDataGovPackages,
);

const worldBankAdapter = createOfficialAdapter(
  'world-bank',
  'fixtureWorldBankIndicators',
  (context) => fetchWorldBankIndicators(context.fetcher ?? fetch, MAX_SOURCE_RECORDS),
  normalizeWorldBankIndicators,
);

const nasaAdapter = createOfficialAdapter(
  'nasa',
  'fixtureNasaApods',
  (context) => fetchNasaApods(context.fetcher ?? fetch, context.collectedAt, MAX_SOURCE_RECORDS),
  normalizeNasaApods,
);

const wikimediaAdapter = createOfficialAdapter(
  'wikimedia',
  'fixtureWikimediaPages',
  (context) => fetchWikimediaPages(context.fetcher ?? fetch, MAX_SOURCE_RECORDS),
  normalizeWikimediaPages,
);

const devToAdapter = createOfficialAdapter(
  'dev-to',
  'fixtureDevArticles',
  (context) => fetchDevArticles(context.fetcher ?? fetch, MAX_SOURCE_RECORDS),
  normalizeDevArticles,
);

const stackOverflowAdapter = createOfficialAdapter(
  'stack-overflow',
  'fixtureStackOverflowQuestions',
  (context) => fetchStackOverflowQuestions(context.fetcher ?? fetch, context.collectedAt, MAX_SOURCE_RECORDS),
  normalizeStackOverflowQuestions,
);

const euOpenDataAdapter = createOfficialAdapter(
  'eu-open-data',
  'fixtureEuDatasets',
  (context) => fetchEuDatasets(context.fetcher ?? fetch, MAX_SOURCE_RECORDS),
  normalizeEuDatasets,
);

/**
 * All selected sources have a named adapter entry. Only adapters marked ready
 * perform Node-side official API work; manual-review entries cannot
 * accidentally turn into browser scraping.
 */
export function createSourceAdapters(): readonly SourceAdapter[] {
  return SOURCE_CATALOG.map((definition) => {
    if (definition.id === hackerNewsAdapter.definition.id) return hackerNewsAdapter;
    if (definition.id === githubAdapter.definition.id) return githubAdapter;
    if (definition.id === openAlexAdapter.definition.id) return openAlexAdapter;
    if (definition.id === dataGovAdapter.definition.id) return dataGovAdapter;
    if (definition.id === worldBankAdapter.definition.id) return worldBankAdapter;
    if (definition.id === nasaAdapter.definition.id) return nasaAdapter;
    if (definition.id === wikimediaAdapter.definition.id) return wikimediaAdapter;
    if (definition.id === devToAdapter.definition.id) return devToAdapter;
    if (definition.id === stackOverflowAdapter.definition.id) return stackOverflowAdapter;
    if (definition.id === euOpenDataAdapter.definition.id) return euOpenDataAdapter;
    return {
      definition,
      collect: async () => skippedResult(definition),
    };
  });
}

export function getSourceAdapter(sourceId: string): SourceAdapter {
  const adapter = createSourceAdapters().find((candidate) => candidate.definition.id === sourceId);
  if (!adapter) throw new Error(`No adapter registered for source: ${sourceId}`);
  return adapter;
}
