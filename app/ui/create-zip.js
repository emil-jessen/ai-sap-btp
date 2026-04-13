/**
 * Creates dist/dist.zip from the contents of the dist/ folder.
 * Used as part of the MTA build pipeline so the HTML5 App Repository
 * deployer can upload the built UI5 application.
 */
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const zipPath = path.join(distDir, 'dist.zip');

if (!fs.existsSync(distDir)) {
  console.error('ERROR: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created dist/dist.zip (${archive.pointer()} bytes)`);
});

archive.on('warning', err => {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err);
  } else {
    throw err;
  }
});

archive.on('error', err => { throw err; });

archive.pipe(output);

// Add all files/folders from dist/, excluding the zip itself
fs.readdirSync(distDir).forEach(entry => {
  if (entry === 'dist.zip') return;
  const entryPath = path.join(distDir, entry);
  const stat = fs.statSync(entryPath);
  if (stat.isDirectory()) {
    archive.directory(entryPath, entry);
  } else {
    archive.file(entryPath, { name: entry });
  }
});

archive.finalize();
