import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, readdir, rm, symlink, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
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
  assert.match(pages.usage, /the whole message including its caption is withheld/);
  assert.match(pages.usage, /Images need no room configuration/);
  assert.match(pages.usage, /Changed provider\/model\/effort\/custom instructions also start a fresh session/);
  assert.match(pages.usage, /requires <code>\/reconnect @agent<\/code>/);
  assert.match(pages.usage, /Stop does not roll back file or command side effects/);
  assert.match(pages.usage, /Failed and interrupted deliveries still need <code>\/retry<\/code>/);
  assert.match(pages.index, /chittr resume --web/);
  assert.match(pages.usage, /Check last action/);
  for (const id of ['commands', 'keyboard']) {
    const section = pages.usage.split(`<section id="${id}"`)[1].split('</section>')[0];
    assert.match(section, /<table>/);
    assert.match(section, /<thead>/);
    assert.match(section, /<tbody>/);
  }
  assert.doesNotMatch(pages.usage, /<p>\|/);
  assert.ok(pages.usage.indexOf('id="compaction"') < pages.usage.indexOf('id="commands"'));
  for (const html of Object.values(pages)) {
    assert.match(html, /Documented release/);
    assert.match(html, new RegExp(map.commit));
    assert.doesNotMatch(html, /blob\/main\/|npm run test:|#85|#105|<h[1-6][^>]*>Development/);
  }
});

// Import synthetic Git objects as test data. No network, commits through a user's
// identity, hooks or global Git configuration are needed to make this fixture.
async function releaseFixture(directory) {
  execFileSync('git', ['init', '--quiet', directory]);
  async function object(type, data) {
    const bytes = Buffer.concat([Buffer.from(`${type} ${data.length}\0`), data]);
    const sha = createHash('sha1').update(bytes).digest('hex');
    const dir = join(directory, '.git/objects', sha.slice(0, 2));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, sha.slice(2)), deflateSync(bytes));
    return sha;
  }
  const entries = {};
  for (const [path, text] of Object.entries(sources)) {
    const parts = path.split('/');
    let parent = entries;
    for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
    parent[parts.at(-1)] = Buffer.from(text);
  }
  async function treeObject(entries) {
    const rows = [];
    for (const name of Object.keys(entries).sort()) {
      const value = entries[name];
      const blob = Buffer.isBuffer(value);
      const sha = blob ? await object('blob', value) : await treeObject(value);
      rows.push(Buffer.from(`${blob ? '100644' : '40000'} ${name}\0`), Buffer.from(sha, 'hex'));
    }
    return object('tree', Buffer.concat(rows));
  }
  const tree = await treeObject(entries);
  const sha = await object('commit', Buffer.from(`tree ${tree}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nSynthetic release fixture\n`));
  await writeFile(join(directory, '.git/refs/tags', map.tag), sha + '\n');
  return sha;
}

test('refresh CLI verifies the release and fails without replacing snapshots', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'chittr-refresh-test-'));
  try {
    const app = join(fixture, 'app');
    const sha = await releaseFixture(app);
    await cp(join(root, 'scripts'), join(fixture, 'scripts'), { recursive: true });
    await cp(join(root, 'guide'), join(fixture, 'guide'), { recursive: true });
    await symlink(join(root, 'node_modules'), join(fixture, 'node_modules'));
    const fixtureMap = { ...map, commit: sha };
    const mapPath = join(fixture, 'guide/source-map.json');
    await writeFile(mapPath, JSON.stringify(fixtureMap));
    const refresh = () => spawnSync(process.execPath, ['scripts/refresh-guide.mjs', '--checkout', app], { cwd: fixture, encoding: 'utf8' });
    let result = refresh(); assert.equal(result.status, 0, result.stderr);
    const saved = await tree(join(fixture, 'guide'));
    assert.equal(JSON.parse(saved['provenance.json']).commit, sha);
    result = refresh(); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await tree(join(fixture, 'guide')), saved);
    for (const fault of ['pin', 'heading', 'missing-source']) {
      const changed = structuredClone(fixtureMap);
      if (fault === 'pin') changed.commit = '0'.repeat(40);
      else if (fault === 'heading') changed.pages[0].sections[0].passages[0].heading = '## Missing heading';
      else changed.pages[0].sections[0].passages[0].file = 'docs/absent.md';
      await writeFile(mapPath, JSON.stringify(changed));
      result = refresh(); assert.notEqual(result.status, 0, fault);
      assert.match(result.stderr, /nothing replaced|selection moved or missing|Unexpected guide source/);
      const after = await tree(join(fixture, 'guide'));
      delete after['source-map.json'];
      const before = { ...saved }; delete before['source-map.json'];
      assert.deepEqual(after, before, `${fault} changed saved sources`);
    }
  } finally { await rm(fixture, { recursive: true, force: true }); }
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
