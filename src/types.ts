export type Difficulty = 'Starter' | 'Intermediate' | 'Advanced';
export type Recommendation = 'build' | 'consider' | 'research';
export type IdeaDecision = 'keep' | 'discard';

export type IdeaFields = {
  id: string;
  title: string;
  summary: string;
  category: string;
  difficulty: Difficulty;
  technologies: string[];
  source: string;
  datasetTools: string;
  whyBuildIt: string;
  suggestedSteps: string[];
  featured?: boolean;
  color: 'blue' | 'purple' | 'orange' | 'green';
  qualityScore?: number;
  recommendation?: Recommendation;
  decision?: IdeaDecision;
  discardReason?: string;
  enrichedBy?: string;
};

export type IdeaProvenance = {
  sourceId?: string;
  sourceName?: string;
  sourceUrl: string;
  license: string;
  usageNote: string;
  attribution?: string;
  collectedAt: string;
  publishedAt?: string;
  qualityScore?: number;
  recommendation?: 'build' | 'consider' | 'research';
  approved: boolean;
};

export type Idea = IdeaFields & Partial<IdeaProvenance>;

export type NormalizedIdea = IdeaFields & IdeaProvenance;

export type SortOption = 'recommended' | 'newest' | 'difficulty-asc' | 'difficulty-desc';
