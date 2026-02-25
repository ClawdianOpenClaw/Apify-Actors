# Daily Scope News Scraper

Scrape viral news from major news sites and Reddit with automatic virality scoring.

## Features

- **News Sites**: BBC, Reuters, AP News, Vox, BuzzFeed
- **Reddit**: Any subreddit with hot/rising/top sorting
- **Auto-scoring**: Virality score calculated (0-100)
- **Deduplication**: Filters duplicate headlines

## Input Configuration

```json
{
  "newsSources": ["bbc", "reuters", "apnews"],
  "redditSubs": ["news", "worldnews", "trueReddit"],
  "redditSorts": ["hot", "rising"],
  "maxResults": 20
}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| newsSources | array | ["bbc", "reuters", "apnews"] | Which news sites to scrape |
| redditSubs | array | ["news", "worldnews"] | Which subreddits |
| redditSorts | array | ["hot", "rising"] | Reddit sort options |
| maxResults | number | 20 | Max stories to return |

### Available News Sources

- `bbc` - BBC News
- `reuters` - Reuters
- `apnews` - AP News
- `vox` - Vox
- `buzzfeed` - BuzzFeed News

### Reddit Sort Options

- `hot` - Currently popular
- `rising` - Exploding fastest
- `top` - Best in time period
- `new` - Newest

## Output

Returns array of stories with virality scores:

```json
[
  {
    "title": "Breaking news title...",
    "url": "https://...",
    "source": "BBC",
    "position": 1,
    "type": "news",
    "viralityScore": 85
  }
]
```

## Virality Scoring

| Source | Score Basis |
|--------|-------------|
| News Site | Position in "Most Read" list (1-10) |
| Reddit | Upvote count + sort popularity |
| Final Score | 0-100 (capped) |
