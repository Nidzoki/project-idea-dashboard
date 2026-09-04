import { describe, expect, it } from 'vitest';
import type { Idea } from '../types';
import { filterAndSortIdeas } from './ideaUtils';

const ideas: Idea[] = [
  { id: '1', title: 'Map story', summary: 'A map project', category: 'Developer Tools', difficulty: 'Intermediate', technologies: ['MapLibre'], source: 'Hacker News', datasetTools: 'Public API', whyBuildIt: 'Learn', suggestedSteps: ['Start'], color: 'blue', sourceUrl: 'https://news.ycombinator.com/item?id=1', license: 'Public API', usageNote: 'Metadata', collectedAt: '2026-01-01T00:00:00.000Z', approved: true },
  { id: '2', title: 'Map explorer', summary: 'An explorer', category: 'Developer Tools', difficulty: 'Advanced', technologies: ['MapLibre'], source: 'Hacker News', datasetTools: 'Public API', whyBuildIt: 'Learn', suggestedSteps: ['Start'], color: 'purple', sourceUrl: 'https://news.ycombinator.com/item?id=2', license: 'Public API', usageNote: 'Metadata', collectedAt: '2026-01-01T00:00:00.000Z', approved: true },
  { id: '3', title: 'API helper', summary: 'A helper', category: 'Developer Tools', difficulty: 'Advanced', technologies: ['API'], source: 'Hacker News', datasetTools: 'Public API', whyBuildIt: 'Learn', suggestedSteps: ['Start'], color: 'green', sourceUrl: 'https://news.ycombinator.com/item?id=3', license: 'Public API', usageNote: 'Metadata', collectedAt: '2026-01-01T00:00:00.000Z', approved: true },
];

describe('filterAndSortIdeas', () => {
  it('matches a query across title, summary, category, and technologies', () => {
    const result = filterAndSortIdeas(ideas, 'maplibre', '', '', '', 'recommended');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((idea) => idea.technologies.includes('MapLibre'))).toBe(true);
  });

  it('combines filters and sorts by difficulty', () => {
    const result = filterAndSortIdeas(ideas, '', 'Developer Tools', '', '', 'difficulty-asc');
    expect(result.length).toBe(3);
    expect(result[0].difficulty).toBe('Intermediate');
    expect(result[result.length - 1]?.difficulty).toBe('Advanced');
  });
});
