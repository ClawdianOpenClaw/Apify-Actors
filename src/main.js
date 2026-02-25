import Apify from 'apify';
import puppeteer from 'puppeteer';

// CSS Selectors for each news source
const SELECTORS = {
    bbc: {
        url: 'https://www.bbc.com/news',
        mostRead: '.most-read__list-items li',
        title: 'h3',
        link: 'a',
        position: true // Rank by position in list
    },
    reuters: {
        url: 'https://www.reuters.com',
        mostRead: '.story-box-collection li, .story-list li',
        title: 'h3, a',
        link: 'a',
        position: true
    },
    apnews: {
        url: 'https://apnews.com/hub/ap-top-25',
        mostRead: '.PageList-Items li, .headline',
        title: 'h3, a',
        link: 'a',
        position: true
    },
    vox: {
        url: 'https://www.vox.com',
        mostRead: '.crop-21-9 li, .most-ember-widget li',
        title: 'h3, a',
        link: 'a',
        position: true
    },
    buzzfeed: {
        url: 'https://www.buzzfeednews.com',
        mostRead: '.news-article, .story-card',
        title: 'h2, h3',
        link: 'a',
        position: true
    }
};

// Reddit configuration
const REDDIT_SUBS = ['news', 'worldnews', 'trueReddit'];

export async function scrapeNewsSource(source, browser) {
    const config = SELECTORS[source];
    if (!config) return [];

    const page = await browser.newPage();
    const results = [];

    try {
        await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        const stories = await page.$$(config.mostRead);
        
        for (let i = 0; i < Math.min(stories.length, 10); i++) {
            try {
                const el = stories[i];
                const titleEl = await el.$(config.title);
                const linkEl = await el.$(config.link);
                
                const title = titleEl ? await titleEl.evaluate(e => e.textContent) : '';
                const url = linkEl ? await linkEl.evaluate(e => e.href) : '';
                
                if (title && url) {
                    results.push({
                        title: title.trim(),
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
    } catch (e) {
        console.log(`Error scraping ${source}:`, e.message);
    } finally {
        await page.close();
    }

    return results;
}

export async function scrapeReddit(sub, browser, sort = 'hot', time = 'day') {
    const page = await browser.newPage();
    const results = [];

    try {
        const url = `https://www.reddit.com/r/${sub}/${sort}/`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for posts to load
        await page.waitForSelector('shreddit-post', { timeout: 10000 }).catch(() => {});
        
        const posts = await page.$$('shreddit-post');
        
        for (let i = 0; i < Math.min(posts.length, 10); i++) {
            try {
                const post = posts[i];
                const title = await post.evaluate(e => e.getAttribute('post-title') || '');
                const permalink = await post.evaluate(e => e.getAttribute('permalink') || '');
                const score = await post.evaluate(e => e.getAttribute('score') || '0');
                
                if (title) {
                    results.push({
                        title: title.trim(),
                        url: 'https://reddit.com' + permalink,
                        source: `r/${sub}`,
                        score: parseInt(score) || 0,
                        sort: sort,
                        time: time,
                        type: 'reddit'
                    });
                }
            } catch (e) {
                // Skip
            }
        }
    } catch (e) {
        console.log(`Error scraping r/${sub}:`, e.message);
    } finally {
        await page.close();
    }

    return results;
}

// Virality scoring
export function calculateViralityScore(story) {
    let score = 0;

    if (story.type === 'news') {
        // News site scoring
        const position = story.position || 10;
        
        if (position <= 3) score = 40;
        else if (position <= 5) score = 30;
        else if (position <= 10) score = 20;
        
        // Source multipliers
        const sourceScores = {
            'BBC': 1.2,
            'REUTERS': 1.3,
            'APNEWS': 1.3,
            'VOX': 1.0,
            'BUZZFEED': 0.8
        };
        score = score * (sourceScores[story.source] || 1.0);
        
    } else if (story.type === 'reddit') {
        // Reddit scoring
        const upvotes = story.score || 0;
        
        if (upvotes >= 5000) score = 40;
        else if (upvotes >= 1000) score = 30;
        else if (upvotes >= 500) score = 20;
        else if (upvotes >= 100) score = 10;
        
        // Sort bonus
        if (story.sort === 'hot') score *= 1.2;
        if (story.sort === 'rising') score *= 1.1;
    }

    return Math.min(Math.round(score), 100);
}

// Main actor function
Apify.main(async () => {
    const input = await Apify.getInput();
    const { 
        newsSources = ['bbc', 'reuters', 'apnews'], 
        redditSubs = ['news', 'worldnews'],
        redditSorts = ['hot', 'rising'],
        maxResults = 20
    } = input || {};

    console.log('Starting Daily Scope scraper...');
    console.log('News sources:', newsSources);
    console.log('Reddit subs:', redditSubs);

    // Launch browser
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let allStories = [];

    // Scrape news sites
    for (const source of newsSources) {
        console.log(`Scraping ${source}...`);
        const stories = await scrapeNewsSource(source, browser);
        allStories.push(...stories);
    }

    // Scrape Reddit
    for (const sub of redditSubs) {
        for (const sort of redditSorts) {
            console.log(`Scraping r/${sub} (${sort})...`);
            const stories = await scrapeReddit(sub, browser, sort, 'day');
            allStories.push(...stories);
        }
    }

    await browser.close();

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
    await Apify.setValue('OUTPUT', topStories);
    
    // Also save to default dataset for easy access
    await Apify.pushData(topStories);

    console.log(`Done! Found ${topStories.length} stories.`);
    console.log('Top story:', topStories[0]?.title);
});
