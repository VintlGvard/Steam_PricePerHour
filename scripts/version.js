#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getCurrentVersion() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return pkg.version;
}

function parseVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

function bumpVersion(version, type) {
  const { major, minor, patch } = parseVersion(version);
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

function analyzeChanges() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    
    const range = lastTag ? `${lastTag}..HEAD` : '';
    const commits = execSync(`git log ${range} --pretty=format:"%s" --no-merges`, { encoding: 'utf8' }).trim();
    
    if (!commits) {
      console.log('No new commits since last tag');
      return null;
    }
    
    const lines = commits.split('\n');
    
    let hasBreaking = false;
    let hasFeature = false;
    let hasFix = false;
    let commitCount = 0;
    
    for (const line of lines) {
      commitCount++;
      const lower = line.toLowerCase();
      
      if (lower.includes('breaking') || lower.includes('!:') || lower.includes('major')) {
        hasBreaking = true;
      }
      
      if (lower.startsWith('feat') || lower.includes('add')) {
        hasFeature = true;
      }
      
      if (lower.startsWith('fix')) {
        hasFix = true;
      }
    }
    
    let filesChanged = 0;
    try {
      const diffRange = lastTag ? `${lastTag}..HEAD` : '';
      const diffStats = execSync(`git diff ${diffRange} --shortstat`, { encoding: 'utf8' }).trim();
      filesChanged = parseInt(diffStats.match(/(\d+) file/)?.[1] || '0');
    } catch (e) {
      filesChanged = commitCount * 2;
    }
    
    console.log(`\nChange analysis:`);
    console.log(`  Commits: ${commitCount}`);
    console.log(`  Files changed: ${filesChanged}`);
    console.log(`  Breaking changes: ${hasBreaking ? '✓' : '✗'}`);
    console.log(`  New features: ${hasFeature ? '✓' : '✗'}`);
    console.log(`  Fixes: ${hasFix ? '✓' : '✗'}`);
    
    if (hasBreaking) {
      return 'major';
    } else if (hasFeature || filesChanged > 10) {
      return 'minor';
    } else if (hasFix || commitCount > 0) {
      return 'patch';
    }
    
    return null;
  } catch (error) {
    console.log('Failed to analyze changes:', error.message);
    return null;
  }
}

function updateVersion(newVersion) {
  const files = [
    { path: 'package.json', key: 'version' },
    { path: 'src/manifests/chrome.json', key: 'version' },
    { path: 'src/manifests/firefox.json', key: 'version' },
  ];
  
  for (const file of files) {
    if (!fs.existsSync(file.path)) continue;
    
    const content = JSON.parse(fs.readFileSync(file.path, 'utf8'));
    content[file.key] = newVersion;
    fs.writeFileSync(file.path, JSON.stringify(content, null, 2) + '\n');
    console.log(`✓ Updated ${file.path}`);
  }
}

function createTag(version) {
  try {
    execSync(`git add package.json src/manifests/`);
    execSync(`git commit -m "chore: bump version to ${version}"`);
    execSync(`git tag v${version}`);
    console.log(`\n✓ Created tag v${version}`);
    console.log('  To publish: git push && git push --tags');
  } catch (error) {
    console.log('\n⚠ Failed to create tag:', error.message);
  }
}

function main() {
  const args = process.argv.slice(2);
  const currentVersion = getCurrentVersion();
  const isAuto = args.includes('--auto');
  
  console.log(`Current version: ${currentVersion}`);
  
  if (args[0] && ['major', 'minor', 'patch'].includes(args[0])) {
    const bumpType = args[0];
    const newVersion = bumpVersion(currentVersion, bumpType);
    console.log(`\nBumping version (${bumpType}): ${currentVersion} → ${newVersion}`);
    
    updateVersion(newVersion);
    
    if (args.includes('--tag')) {
      createTag(newVersion);
    }
    
    return;
  }
  
  const bumpType = analyzeChanges();
  
  if (!bumpType) {
    if (isAuto) {
      console.log('\nNo changes detected, but --auto mode: bumping patch version');
      const newVersion = bumpVersion(currentVersion, 'patch');
      console.log(`\nAuto-bumping patch: ${currentVersion} → ${newVersion}`);
      updateVersion(newVersion);
      createTag(newVersion);
      return;
    }
    console.log('\nNo changes require version bump');
    return;
  }
  
  const newVersion = bumpVersion(currentVersion, bumpType);
  console.log(`\nRecommended version bump (${bumpType}): ${currentVersion} → ${newVersion}`);
  
  if (isAuto) {
    console.log('\n✓ Auto-applying...');
    updateVersion(newVersion);
    createTag(newVersion);
    return;
  }
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question('\nApply? (y/n) ', (answer) => {
    rl.close();
    
    if (answer.toLowerCase() === 'y') {
      updateVersion(newVersion);
      
      rl.question('Create git tag? (y/n) ', (tagAnswer) => {
        rl.close();
        if (tagAnswer.toLowerCase() === 'y') {
          createTag(newVersion);
        }
      });
    } else {
      console.log('Cancelled');
    }
  });
}

main();
