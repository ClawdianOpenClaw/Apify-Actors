import { Actor } from 'apify';

await Actor.init();

console.log('Actor starting...');

const input = await Actor.getInput();
console.log('Input:', JSON.stringify(input));

// Simple test - just return a message
const result = {
    message: 'Actor is working!',
    timestamp: new Date().toISOString(),
    testedSources: ['bbc', 'reuters', 'apnews']
};

await Actor.pushData(result);

console.log('Done! Pushed result:', JSON.stringify(result));

await Actor.exit();
