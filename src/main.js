import { Actor } from 'apify';

// CSS Selectors for each news source
const SELECTORS = {
    bbc: {
        url: 'https://www.bbc.com/news',
        mostRead: '.most-read__list-items li',
        title: 'h3',
        link: 'a'
    },
    reuters: {
        url: 'https://www.reuters.com',
        mostRead: '.story-box-collection li, .story-list li',
        title: 'h3, a',
        link: 'a'
    },
    apnews: {
        url: 'https://apnews.com/hub/ap-top-25',
        mostRead: '.PageList-Items li, .headline',
        title: 'h3, a',
        link: 'a'
    },
    vox: {
        url: 'https://www.vox.com',
        mostRead: '.crop-21-9 li, .most-ember-widget li',
        title: 'h3, a',
        link: 'a'
    },
    buzzfeed: {
        url: 'https://www.buzzfeednews.com',
        mostRead: '.news-article, .story-card',
        title: 'h2, h3',
        link: 'a'
    }
};

async function scrapeNewsSource(source) {
    const config = SELECTORS[source];
    if (!config) return [];

    const results = [];

    try {
        const page = await Actor.newPage();
        
        await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        const stories = await page.$$(config.mostRead);
        
        for (let i = 0; i < Math.min(stories.length, 10); i++) {
            try {
                const el = stories[i];
                const titleEl = await el.$(config.title);
                const linkEl = await el.$(config.link);
                
                const title = titleEl ? await titleEl.evaluate(e => e.textContent) : '';
                const url = linkEl ? await linkEl.evaluate(e => e.href) : '';
                
                if (title && url && title.length > 5) {
                    results.push({
                        title: title.trim().substring(0, 200),
                        url: url.trim(),
                        source: source.toUpperCase(),
                        position: i + 1,
                        type: 'news'
                    });
                }
            } catch (e) {
                // Skip failed elements
            }
        }
        
        await page.close();
        
    } catch (e) {
        console.log(`Error scraping ${source}:`, e.message);
    }

    return results;
}

async function scrapeReddit(sub, sort = 'hot') {
    const results = [];

    try {
        const page = await Actor.newPage();
        
        const url = `https://www.reddit.com/r/${sub}/${sort}/`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for content
        await page.waitForTimeout(3000);
        
        const posts = await page.$$('shreddit-post');
        
        for (let i = 0; i < Math.min(posts.length, 10); i++) {
            try {
                const post = posts[i];
                const title = await post.evaluate(e => e.getAttribute('post-title') || '');
                const permalink = await post.evaluate(e => e.getAttribute('permalink') || '');
                const score = await post.evaluate(e => e.getAttribute('score') || '0');
                
                if (title && title.length > 5) {
                    results.push({
                        title: title.trim().substring(0, 200),
                        url: 'https://reddit.com' + permalink,
                        source: `r/${sub}`,
                        score: parseInt(score) || 0,
                        sort: sort,
                        type: 'reddit'
                    });
                }
            } catch (e) {
                // Skip
            }
        }
        
        await page.close();
        
    } catch (e) {
        console.log(`Error scraping r/${sub}:`, e.message);
    }

    return results;
}

function calculateViralityScore(story) {
    let score = 0;

    if (story.type === 'news') {
        const position = story.position || 10;
        
        if (position <= 3) score = 40;
        else if (position <= 5) score = 30;
        else if (position <= 10) score = 20;
        
        const sourceScores = {
            'BBC': 1.2,
            'REUTERS': 1.3,
            'APNEWS': 1.3,
            'VOX': 1.0,
            'BUZZFEED': 0.8
        };
        score = score * (sourceScores[story.source] || 1.0);
        
    } else if (story.type === 'reddit') {
        const upvotes = story.score || 0;
        
        if (upvotes >= 5000) score = 40;
        else if (upvotes >= 1000) score = 30;
        else if (upvotes >= 500) score = 20;
        else if (upvotes >= 100) score = 10;
        
        if (story.sort === 'hot') score *= 1.2;
        if (story.sort === 'rising') score *= 1.1;
    }

    return Math.min(Math.round(score), 100);
}

// Main function
await Actor.init();

const input = await Actor.getInput();
const { 
    newsSources = ['bbc', 'reuters', 'apnews'], 
    redditSubs = ['news', 'worldnews'],
    redditSorts = ['hot', 'rising'],
    maxResults = 20
} = input || {};

console.log('Starting Daily Scope scraper...');
console.log('News sources:', newsSources);
console.log('Reddit subs:', redditSubs);

let allStories = [];

// Scrape news sites
for (const source of newsSources) {
    console.log(`Scraping ${source}...`);
    try {
        const stories = await scrapeNewsSource(source);
        allStories.push(...stories);
    } catch (e) {
        console.log(`Failed to scrape ${source}:`, e.message);
    }
}

// Scrape Reddit
for (const sub of redditSubs) {
    for (const sort of redditSorts) {
        console.log(`Scraping r/${sub} (${sort})...`);
        try {
            const stories = await scrapeReddit(sub, sort);
            allStories.push(...stories);
        } catch (e) {
            console.log(`Failed to scrape r/${sub}:`, e.message);
        }
    }
}

// Calculate virality scores
const scoredStories = allStories.map(story => ({
    ...story,
    viralityScore: calculateViralityScore(story)
}));

// Sort by score
scoredStories.sort((a, b) => b.viralityScore - a.viralityScore);

// Limit results
const topStories = scoredStories.slice(0, maxResults);

// Save results
await Actor.pushData(topStories);

console.log(`Done! Found ${topStories.length} stories.`);
if (topStories.length > 0) {
    console.log('Top story:', topStories[0].title);
    console.log('Top score:', topStories[0].viralityScore);
}

await Actor.exit();
