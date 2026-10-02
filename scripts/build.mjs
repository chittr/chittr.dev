import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadGuide, renderGuide } from './guide.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const { map, sources } = await loadGuide();
const pages = map.pages.map((page) => [page, renderGuide(map, sources, page)]);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Only public assets and rendered documentation. Never publish source snapshots or tooling.
for (const name of ['index.html', 'styles.css', 'script.js', 'copy.js', 'guide.css', 'assets']) {
  await cp(new URL(name, root), new URL(name, output), { recursive: true });
}
for (const [page, html] of pages) {
  const directory = new URL(page.slug === 'index' ? 'guide/' : `guide/${page.slug}/`, output);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), html);
}
await writeFile(new URL('guide/LICENSE.txt', output), sources.LICENSE);
console.log(`Static site staged in ${fileURLToPath(output)}`);
