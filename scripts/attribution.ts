import type { NormalizedIdea } from '../src/types';
import { SOURCE_CATALOG } from './sourceCatalog';

export type AttributionManifest = {
  generatedAt: string;
  policy: string;
  sources: Array<{
    id: string;
    name: string;
    status: string;
    endpoint: string;
    license: string;
    attribution: string;
    rateLimit: string;
    notes: string;
    ideaCount: number;
    ideaIds: string[];
  }>;
};

export function createAttributionManifest(ideas: NormalizedIdea[], generatedAt: string): AttributionManifest {
  return {
    generatedAt,
    policy:
      'Metadata and short deterministic summaries only. Preserve each source URL, licence, attribution, and usage note; review source terms before publishing.',
    sources: SOURCE_CATALOG.map((source) => {
      const sourceIdeas = ideas.filter((idea) => idea.sourceId === source.id);
      return {
        id: source.id,
        name: source.name,
        status: source.status,
        endpoint: source.endpoint,
        license: source.license,
        attribution: source.attribution,
        rateLimit: source.rateLimit,
        notes: source.notes,
        ideaCount: sourceIdeas.length,
        ideaIds: sourceIdeas.map((idea) => idea.id),
      };
    }),
  };
}

