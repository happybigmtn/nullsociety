const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const EXCLUDED_DIRS = new Set([
  '.git',
  '.turbo',
  '.cache',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  'logs',
  'backups',
  'qa-artifacts',
]);

const EXCLUDED_DIR_SUFFIXES = new Set([
  `${path.sep}wasm${path.sep}pkg`,
  `${path.sep}wasm${path.sep}pkg-test`,
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs']);

function isExcludedDir(dirPath) {
  const base = path.basename(dirPath);
  if (EXCLUDED_DIRS.has(base)) return true;
  for (const suffix of EXCLUDED_DIR_SUFFIXES) {
    if (dirPath.endsWith(suffix)) return true;
  }
  return false;
}

function walk(dir, files) {
  if (isExcludedDir(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isExcludedDir(fullPath)) continue;
      walk(fullPath, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SOURCE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function isTestFile(relPath) {
  const normalized = toPosix(relPath);
  if (normalized.includes('/__tests__/')) return true;
  if (normalized.includes('/tests/')) return true;
  return /(\.test|\.spec)\.[tj]sx?$/.test(normalized) || /(\.test|\.spec)\.[mc]?js$/.test(normalized);
}

function makeTestKey(relPath) {
  let normalized = toPosix(relPath);
  normalized = normalized.replace(/\/__tests__\//g, '/');
  normalized = normalized.replace(/\.(test|spec)\.[tj]sx?$/, '');
  normalized = normalized.replace(/\.(test|spec)\.[mc]?js$/, '');
  return normalized.replace(/\.[^.]+$/, '');
}

function makeSourceKey(relPath) {
  return toPosix(relPath).replace(/\.[^.]+$/, '');
}

function hasInlineRustTests(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return (
    content.includes('#[cfg(test)]') ||
    /\bmod\s+tests\b/.test(content) ||
    /\#\[test\]/.test(content)
  );
}

const allFiles = [];
walk(ROOT, allFiles);

const testFiles = [];
const sourceFiles = [];

for (const file of allFiles) {
  const rel = path.relative(ROOT, file);
  if (isTestFile(rel)) {
    testFiles.push(file);
  } else if (!rel.endsWith('.d.ts')) {
    sourceFiles.push(file);
  }
}

const testKeys = new Set(testFiles.map((file) => makeTestKey(path.relative(ROOT, file))));
const sourceKeys = new Set(
  sourceFiles
    .filter((file) => path.extname(file) !== '.rs')
    .map((file) => makeSourceKey(path.relative(ROOT, file)))
);

let testedCount = 0;
const statsByLang = new Map();
const statsByArea = new Map();
const uncoveredByArea = new Map();

for (const file of sourceFiles) {
  const rel = path.relative(ROOT, file);
  const ext = path.extname(file);
  const langKey = ext.replace('.', '') || 'unknown';
  const area = toPosix(rel).split('/')[0] || 'root';
  const sourceKey = makeSourceKey(rel);

  let tested = false;
  if (ext === '.rs') {
    tested = hasInlineRustTests(file);
  } else {
    tested = testKeys.has(sourceKey);
  }

  if (tested) testedCount += 1;

  const langStats = statsByLang.get(langKey) || { total: 0, tested: 0 };
  langStats.total += 1;
  langStats.tested += tested ? 1 : 0;
  statsByLang.set(langKey, langStats);

  const areaStats = statsByArea.get(area) || { total: 0, tested: 0 };
  areaStats.total += 1;
  areaStats.tested += tested ? 1 : 0;
  statsByArea.set(area, areaStats);

  if (!tested) {
    const areaList = uncoveredByArea.get(area) || [];
    areaList.push(rel);
    uncoveredByArea.set(area, areaList);
  }
}

const totalSources = sourceFiles.length;
const percent = totalSources === 0 ? 0 : (testedCount / totalSources) * 100;

const orphanTests = testFiles.filter((file) => {
  const rel = path.relative(ROOT, file);
  const key = makeTestKey(rel);
  return !sourceKeys.has(key);
});

console.log('Test presence summary (file-level proxy)');
console.log(`Total source files: ${totalSources}`);
console.log(`Tested source files: ${testedCount} (${percent.toFixed(1)}%)`);
console.log('');
console.log('By language:');
for (const [lang, stats] of [...statsByLang.entries()].sort()) {
  const langPct = stats.total === 0 ? 0 : (stats.tested / stats.total) * 100;
  console.log(`- ${lang}: ${stats.tested}/${stats.total} (${langPct.toFixed(1)}%)`);
}

console.log('');
console.log('By top-level area:');
for (const [area, stats] of [...statsByArea.entries()].sort()) {
  const areaPct = stats.total === 0 ? 0 : (stats.tested / stats.total) * 100;
  console.log(`- ${area}: ${stats.tested}/${stats.total} (${areaPct.toFixed(1)}%)`);
}

console.log('');
console.log(`Test files without direct source mapping: ${orphanTests.length}`);

const topGaps = [...uncoveredByArea.entries()]
  .map(([area, files]) => ({ area, count: files.length }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 8);

console.log('');
console.log('Largest uncovered areas (by file count):');
for (const gap of topGaps) {
  console.log(`- ${gap.area}: ${gap.count} files`);
}
