#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const items = fs.readdirSync(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function createArchive(sourceDir, outputPath) {
  const zip = new AdmZip();
  
  function addDirectory(dirPath, zipPath) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const itemZipPath = zipPath ? path.join(zipPath, item) : item;
      
      if (fs.statSync(itemPath).isDirectory()) {
        addDirectory(itemPath, itemZipPath);
      } else {
        zip.addLocalFile(itemPath, zipPath || '');
      }
    }
  }
  
  addDirectory(sourceDir, '');
  zip.writeZip(outputPath);
  
  const stats = fs.statSync(outputPath);
  console.log(`✓ ${path.basename(outputPath)} (${(stats.size / 1024).toFixed(1)} KB)`);
}

function cleanReleases() {
  const releasesDir = 'releases';
  if (fs.existsSync(releasesDir)) {
    fs.rmSync(releasesDir, { recursive: true, force: true });
    console.log('✓ Cleaned releases/');
  }
  fs.mkdirSync(releasesDir, { recursive: true });
}

function main() {
  console.log('Building releases...\n');
  
  cleanReleases();
  
  createArchive('dist/chrome', 'releases/steam-priceperhour-chrome.zip');
  copyDir('dist/chrome', 'releases/chrome-unpacked');
  console.log('✓ chrome-unpacked/ (unpacked for development)');
  
  createArchive('dist/firefox', 'releases/steam-priceperhour-firefox.xpi');
  
  console.log('\n✓ Releases ready');
}

main();
