const archiver = require("archiver");
const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "dist");
const zipPath = path.join(distDir, "dist.zip");
const requiredFiles = ["index.html", "manifest.json"];

if (!fs.existsSync(distDir)) {
  console.error('ERROR: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(distDir, file))) {
    console.error(`ERROR: dist/${file} not found. Build output is incomplete.`);
    process.exit(1);
  }
}

const output = fs.createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`Created dist/dist.zip (${archive.pointer()} bytes)`);
});

archive.on("warning", (err) => {
  if (err.code === "ENOENT") {
    console.warn("Warning:", err);
  } else {
    throw err;
  }
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);

fs.readdirSync(distDir).forEach((entry) => {
  if (entry === "dist.zip") {
    return;
  }

  const entryPath = path.join(distDir, entry);
  const stat = fs.statSync(entryPath);

  if (stat.isDirectory()) {
    archive.directory(entryPath, entry);
  } else {
    archive.file(entryPath, { name: entry });
  }
});

archive.finalize();