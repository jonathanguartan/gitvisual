const simpleGit = require('simple-git');
const path = require('path');

async function test() {
    const repoPath = process.cwd();
    console.log('Testing repoPath:', repoPath);
    const normalized = path.normalize(repoPath);
    console.log('Normalized:', normalized);
    
    try {
        const g = simpleGit(normalized);
        const isRepo = await g.checkIsRepo();
        console.log('isRepo:', isRepo);
        
        const config = await g.listConfig();
        console.log('Config keys count:', Object.keys(config.all).length);
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
