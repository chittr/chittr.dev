import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadGuide, selectPassage, renderGuide, markdown, blobHash } from '../scripts/guide.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { map, sources } = await loadGuide();
async function tree(directory, prefix = '') {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await tree(join(directory, entry.name), key + '/'));
    else result[key] = await readFile(join(directory, entry.name), 'utf8');
  }
  return result;
}

test('built site has only the public allowlist and stable output', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const first = await tree(join(root, 'dist'));
  assert.deepEqual(Object.keys(first).sort(), ['assets/chittr.svg', 'copy.js', 'guide.css', 'guide/LICENSE.txt', 'guide/configuration/index.html', 'guide/index.html', 'guide/usage/index.html', 'index.html', 'script.js', 'styles.css'].sort());
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  assert.deepEqual(await tree(join(root, 'dist')), first);
  assert.equal(first['guide/LICENSE.txt'], sources.LICENSE);
});

test('guide contains release text and complete examples, omits developer commands and moving app links', () => {
  const pages = Object.fromEntries(map.pages.map((page) => [page.slug, renderGuide(map, sources, page)]));
  assert.match(pages.configuration, /A project with an <code>agents<\/code> section uses exactly that roster/);
  assert.match(pages.configuration, /Trusted commands have broader account access, including skill writes/);
  assert.match(pages.configuration, /version: 1\nhuman:/);
  assert.match(pages.configuration, /version: 1\nagents:\n  astra:/);
  assert.match(pages.usage, /caption included/);
  assert.match(pages.usage, /resumed Codex thread, a mixed room configuration/);
  assert.match(pages.usage, /Changed provider\/model\/effort\/custom instructions also start a fresh session/);
  assert.match(pages.usage, /requires <code>\/reconnect @agent<\/code>/);
  assert.ok(pages.usage.indexOf('id="compaction"') < pages.usage.indexOf('id="commands"'));
  for (const html of Object.values(pages)) {
    assert.match(html, /Documented release/);
    assert.match(html, new RegExp(map.commit));
    assert.doesNotMatch(html, /blob\/main\/|npm run test:|#85|#105|<h[1-6][^>]*>Development/);
  }
});

test('missing or moved source selections fail instead of producing partial documentation', () => {
  const section = map.pages[0].sections[0].passages[0];
  assert.throws(() => selectPassage(section, {}), /Missing source/);
  assert.throws(() => selectPassage({ ...section, heading: '## Removed heading' }, sources), /selection moved or missing/);
  assert.throws(() => selectPassage(section, { ...sources, 'README.md': '\n' + sources['README.md'] }), /selection moved or missing/);
  assert.throws(() => selectPassage({ ...section, exactSpans: ['This was never in the release.'] }, sources), /Missing or ambiguous/);
});

test('app links require pinned files and fragments, including absolute main URLs', () => {
  const usage = map.pages.find((page) => page.slug === 'usage');
  const html = renderGuide(map, sources, usage);
  assert.ok(html.includes(`/blob/${map.commit}/docs/architecture.md#context-maintenance`));
  assert.throws(() => renderGuide(map, { ...sources, 'docs/architecture.md': undefined }, usage), /Unverified source link/);
  assert.throws(() => renderGuide(map, { ...sources, 'docs/architecture.md': '# Nothing here\n' }, usage), /Unverified source fragment/);
  assert.equal(markdown.render('<script>alert(1)</script>\n'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n');
});

test('build rejects corrupt snapshots and stale provenance before replacing existing output', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'chittr-guide-test-'));
  try {
    await cp(join(root, 'scripts'), join(fixture, 'scripts'), { recursive: true });
    await cp(join(root, 'guide'), join(fixture, 'guide'), { recursive: true });
    await cp(join(root, 'dist'), join(fixture, 'dist'), { recursive: true });
    await symlink(join(root, 'node_modules'), join(fixture, 'node_modules'));
    const before = await tree(join(fixture, 'dist'));
    const source = join(fixture, 'guide/upstream/README.md');
    const original = await readFile(source, 'utf8');
    await writeFile(source, original + '\nunauthorized content\n');
    let run = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Changed upstream snapshot/);
    assert.deepEqual(await tree(join(fixture, 'dist')), before);
    await writeFile(source, original);
    const changedMap = structuredClone(map); changedMap.commit = '0'.repeat(40);
    await writeFile(join(fixture, 'guide/source-map.json'), JSON.stringify(changedMap));
    run = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /pin does not match/);
    assert.deepEqual(await tree(join(fixture, 'dist')), before);
    assert.equal(blobHash(original), JSON.parse(await readFile(join(fixture, 'guide/provenance.json'), 'utf8')).files['README.md']);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
