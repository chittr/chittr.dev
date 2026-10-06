import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { guideRoot, validateMap, requiredSources, blobHash, checkGuideLinks, loadSite } from './guide.mjs';

// Reads a local app checkout. Fetching a release is a separate, explicit maintainer step.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--checkout') throw new Error('Usage: node scripts/refresh-guide.mjs --checkout /path/to/chittr');
const checkout = resolve(args[1]);
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
const map = JSON.parse(await readFile(new URL('source-map.json', guideRoot), 'utf8'));
validateMap(map);
const resolved = git('rev-parse', '--verify', `refs/tags/${map.tag}^{commit}`).trim();
if (resolved !== map.commit) throw new Error(`Release tag ${map.tag} resolves to ${resolved}, not ${map.commit}; nothing replaced`);
// Read every referenced release file and check the pages before touching saved inputs.
const sources = Object.fromEntries(requiredSources(map).map((file) => [file, git('show', `${map.commit}:${file}`)]));
checkGuideLinks(map, await loadSite(map));
const files = Object.fromEntries(Object.keys(sources).sort().map((file) => [file, blobHash(sources[file])]));
const provenance = JSON.stringify({ repository: map.repository, tag: map.tag, commit: map.commit, files }, null, 2) + '\n';
const stage = new URL('.refresh-stage/', guideRoot);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
try {
  for (const file of Object.keys(files)) {
    const dest = new URL(file, stage);
    await mkdir(new URL('./', dest), { recursive: true });
    await writeFile(dest, sources[file]);
  }
  await rm(new URL('upstream/', guideRoot), { recursive: true, force: true });
  await rename(stage, new URL('upstream/', guideRoot));
  await writeFile(new URL('provenance.json', guideRoot), provenance);
} finally { await rm(stage, { recursive: true, force: true }); }
console.log(`Refreshed ${map.tag} at ${map.commit}: ${Object.keys(files).length} verified source files`);
