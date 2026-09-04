import { describe, expect, it } from 'vitest';
import fixture from './fixtures/hacker-news-stories.json';
import {
  fetchHackerNewsStories,
  normalizeHackerNewsStories,
  validateNormalizedIdeas,
  type HackerNewsStory,
} from './hackerNewsPipeline';

describe('Hacker News normalization pipeline', () => {
  it('normalizes relevant stories, strips HTML, and deduplicates titles', () => {
    const ideas = normalizeHackerNewsStories(fixture.stories as HackerNewsStory[], fixture.collectedAt);

    expect(ideas).toHaveLength(2);
    expect(ideas[0]).toMatchObject({
      id: 'hn-101',
      title: 'A calmer way to plan small projects',
      summary: 'How do you keep a project small? I would love a lightweight planning tool for focused builders.',
      sourceUrl: 'https://news.ycombinator.com/item?id=101',
      collectedAt: fixture.collectedAt,
      approved: false,
    });
    expect(ideas[1]).toMatchObject({
      id: 'hn-102',
      title: 'A local-first project notebook',
      technologies: ['React', 'TypeScript'],
    });
    expect(() => validateNormalizedIdeas(ideas)).not.toThrow();
  });

  it('rejects malformed generated data', () => {
    expect(() => validateNormalizedIdeas([{ id: 'duplicate' }])).toThrow(/invalid title/i);
  });

  it('rejects stories older than seven days and invalid collection dates', () => {
    const oldStory: HackerNewsStory = {
      id: 999,
      title: 'Ask HN: An old prompt',
      type: 'story',
      feed: 'ask',
      time: Math.floor(Date.parse('2024-01-01T00:00:00.000Z') / 1000),
    };
    expect(normalizeHackerNewsStories([oldStory], '2026-01-01T00:00:00.000Z')).toHaveLength(0);
    expect(() => normalizeHackerNewsStories([], 'not-a-date')).toThrow(/valid date/i);
  });

  it('uses the public Ask HN and Show HN feeds without browser APIs', async () => {
    const requestedUrls: string[] = [];
    const fetcher = async (url: string) => {
      requestedUrls.push(url);
      const body = url.endsWith('/askstories.json')
        ? [201]
        : url.endsWith('/showstories.json')
          ? [202]
          : {
              id: Number(url.match(/item\/(\d+)/)?.[1]),
              title: 'Ask HN: Test story',
              type: 'story',
            };
      return { ok: true, status: 200, json: async () => body } as Response;
    };

    const stories = await fetchHackerNewsStories(fetcher, 1);

    expect(stories).toHaveLength(2);
    expect(requestedUrls).toEqual(expect.arrayContaining([
      'https://hacker-news.firebaseio.com/v0/askstories.json',
      'https://hacker-news.firebaseio.com/v0/showstories.json',
      'https://hacker-news.firebaseio.com/v0/item/201.json',
      'https://hacker-news.firebaseio.com/v0/item/202.json',
    ]));
  });
});
