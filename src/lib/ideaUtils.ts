import type { Idea, SortOption } from '../types';

const difficultyRank = { Starter: 1, Intermediate: 2, Advanced: 3 };

export function filterAndSortIdeas(
  source: Idea[],
  query: string,
  category: string,
  difficulty: string,
  technology: string,
  sort: SortOption,
): Idea[] {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = source.filter((idea) => {
    const searchable = [idea.title, idea.summary, idea.category, ...idea.technologies].join(' ').toLowerCase();
    return (
      (!normalizedQuery || searchable.includes(normalizedQuery)) &&
      (!category || idea.category === category) &&
      (!difficulty || idea.difficulty === difficulty) &&
      (!technology || idea.technologies.includes(technology))
    );
  });

  return [...filtered].sort((a, b) => {
    if (sort === 'difficulty-asc') return difficultyRank[a.difficulty] - difficultyRank[b.difficulty];
    if (sort === 'difficulty-desc') return difficultyRank[b.difficulty] - difficultyRank[a.difficulty];
    if (sort === 'newest') return b.id.localeCompare(a.id);
    return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.title.localeCompare(b.title);
  });
}
