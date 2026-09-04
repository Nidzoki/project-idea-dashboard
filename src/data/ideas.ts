import generatedIdeas from './generated/pipeline-ideas.json';
import type { Idea } from '../types';

// Discard decisions stay in the generated audit payload with their provenance and
// reason, but never become public dashboard content.
export const ideas: Idea[] = (generatedIdeas as Idea[]).filter(
  (idea) => idea.decision === 'keep' && idea.enrichedBy === 'gemini',
);
export const categories = [...new Set(ideas.map((idea) => idea.category))].sort();
export const technologies = [...new Set(ideas.flatMap((idea) => idea.technologies))].sort();
