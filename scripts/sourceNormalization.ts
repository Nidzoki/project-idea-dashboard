import type { NormalizedIdea } from '../src/types';
import type { SourceDefinition } from './sourceCatalog';
import { cutoffTimestamp, RECENCY_WINDOW_DAYS } from './retentionPolicy';

export type SourceMetadataRecord = {
  id: string;
  title: string;
  summary?: string;
  url: string;
  publishedAt?: string;
  category?: string;
  difficulty?: NormalizedIdea['difficulty'];
  technologies?: string[];
  datasetTools?: string;
  license?: string;
  usageNote?: string;
  attribution?: string;
};

export function normalizeSourceMetadata(
  definition: SourceDefinition,
  record: SourceMetadataRecord,
  collectedAt: string,
): NormalizedIdea | null {
  const publishedTimestamp = record.publishedAt ? Date.parse(record.publishedAt) : Date.parse(collectedAt);
  if (!record.id || !record.title.trim() || !/^https?:\/\//i.test(record.url)) return null;
  if (Number.isNaN(publishedTimestamp)) return null;
  if (publishedTimestamp < cutoffTimestamp(collectedAt, RECENCY_WINDOW_DAYS)) return null;
  const title = record.title.trim();
  const summary = (record.summary?.trim() || `A project prompt inspired by ${definition.name}: ${title}.`).slice(0, 240);
  return {
    id: `${definition.id}-${record.id}`,
    title,
    summary,
    category: record.category ?? 'General',
    difficulty: record.difficulty ?? 'Starter',
    technologies: record.technologies?.length ? [...new Set(record.technologies)].slice(0, 6) : ['Web'],
    source: definition.name,
    datasetTools: record.datasetTools ?? definition.name,
    whyBuildIt: 'Turn public source metadata into a small, testable project direction.',
    suggestedSteps: ['Read the original source record', 'Define the smallest useful outcome', 'Test the idea with a few intended users'],
    color: 'blue',
    sourceId: definition.id,
    sourceName: definition.name,
    sourceUrl: record.url,
    license: record.license ?? definition.license,
    usageNote: record.usageNote ?? definition.notes,
    attribution: record.attribution ?? definition.attribution,
    collectedAt,
    publishedAt: record.publishedAt,
    approved: false,
  };
}
