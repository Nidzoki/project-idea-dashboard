import type { NormalizedIdea, Recommendation } from '../src/types';

const categoryRules: Array<[string, RegExp]> = [
  ['Data & Civic Tech', /\b(data|dataset|open data|civic|public service|government|climate)\b/i],
  ['Developer Tools', /\b(api|developer|debug|repository|code|cli|software|library|tooling)\b/i],
  ['Learning', /\b(learn|education|course|study|research|student|tutorial)\b/i],
  ['Community', /\b(community|people|local|neighbour|volunteer|forum|discussion)\b/i],
  ['Creative Tools', /\b(art|design|music|story|visual|creative|media)\b/i],
];

const technologyRules: Array<[string, RegExp]> = [
  ['TypeScript', /\btypescript\b/i],
  ['JavaScript', /\bjavascript\b/i],
  ['Python', /\bpython\b/i],
  ['Rust', /\brust\b/i],
  ['Go', /\b(?:golang|\bgo\b)/i],
  ['React', /\breact\b/i],
  ['Node.js', /\bnode(?:\.js)?\b/i],
  ['API', /\bapi\b/i],
  ['Data', /\bdata(?:set|base)?s?\b/i],
  ['GIS', /\b(?:gis|map|geospatial|location)\b/i],
  ['AI', /\b(?:ai|llm|machine learning)\b/i],
];

function scoreIdea(idea: NormalizedIdea): number {
  let score = 45;
  if (idea.title.length >= 12) score += 10;
  if (idea.summary.length >= 60) score += 10;
  if (idea.sourceUrl) score += 10;
  if (idea.license && idea.usageNote) score += 10;
  if (idea.suggestedSteps.length >= 3) score += 10;
  if (idea.technologies.length > 0) score += 5;
  return Math.min(score, 100);
}

function classifyCategory(idea: NormalizedIdea): string {
  const text = `${idea.title} ${idea.summary} ${idea.category}`;
  return categoryRules.find(([, rule]) => rule.test(text))?.[0] ?? idea.category ?? 'General';
}

function classifyDifficulty(idea: NormalizedIdea): NormalizedIdea['difficulty'] {
  const text = `${idea.title} ${idea.summary} ${idea.technologies.join(' ')}`;
  if (/\b(distributed|compiler|machine learning|geospatial|real[- ]time|security)\b/i.test(text)) return 'Advanced';
  if (idea.technologies.length >= 3 || idea.suggestedSteps.length > 3) return 'Intermediate';
  return idea.difficulty;
}

function classifyTechnologies(idea: NormalizedIdea): string[] {
  const text = `${idea.title} ${idea.summary} ${idea.datasetTools} ${idea.technologies.join(' ')}`;
  const inferred = technologyRules.filter(([, rule]) => rule.test(text)).map(([name]) => name);
  return [...new Set([...idea.technologies, ...inferred])].slice(0, 6);
}

function classifyRecommendation(score: number, idea: NormalizedIdea): Recommendation {
  if (score >= 80 && idea.suggestedSteps.length >= 3) return 'build';
  if (score >= 60) return 'consider';
  return 'research';
}

export function classifyIdea(idea: NormalizedIdea): NormalizedIdea {
  const classified: NormalizedIdea = {
    ...idea,
    category: classifyCategory(idea),
    difficulty: classifyDifficulty(idea),
    technologies: classifyTechnologies(idea),
  };
  const qualityScore = scoreIdea(classified);
  return {
    ...classified,
    qualityScore,
    recommendation: classifyRecommendation(qualityScore, classified),
  };
}

export function classifyIdeas(ideas: NormalizedIdea[]): NormalizedIdea[] {
  return ideas.map(classifyIdea);
}

