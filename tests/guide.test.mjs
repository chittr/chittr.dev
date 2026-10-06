import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, readdir, rm, symlink, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadGuide, renderGuide, parseSitePage, checkGuideLinks, markdown, blobHash } from '../scripts/guide.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { map, sources, site } = await loadGuide();
const pageOf = (slug) => map.pages.find((page) => page.slug === slug);
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
  assert.deepEqual(Object.keys(first).sort(), ['analytics.js', 'assets/chittr.svg', 'copy.js', 'guide.css', 'guide/LICENSE.txt', 'guide/configuration/index.html', 'guide/index.html', 'guide/usage/index.html', 'index.html', 'script.js', 'styles.css'].sort());
  for (const page of Object.keys(first).filter((name) => name.endsWith('.html'))) {
    assert.match(first[page].split('</head>')[0], /<script src="\/?analytics\.js" async><\/script>/, page);
  }
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  assert.deepEqual(await tree(join(root, 'dist')), first);
  assert.equal(first['guide/LICENSE.txt'], sources.LICENSE);
  // Chittr is described as a macOS app, not one tied to a Mac chip.
  for (const page of Object.keys(first).filter((name) => name.endsWith('.html'))) assert.doesNotMatch(first[page], /Apple Silicon/i, page);
  // GitHub appears only as the homepage footer's changelog link and each guide page's link to the documented release.
  assert.deepEqual(first['index.html'].match(/https:\/\/github\.com\/[^"]*/g), ['https://github.com/chittr/chittr/blob/main/CHANGELOG.md']);
  for (const page of ['guide/index.html', 'guide/configuration/index.html', 'guide/usage/index.html']) {
    assert.deepEqual(first[page].match(/https:\/\/github\.com\/[^"]*/g), [`https://github.com/${map.repository}/tree/${map.commit}`], page);
  }
});

test('guide pages keep their caveats and tables, and cite no app source files', () => {
  const pages = Object.fromEntries(map.pages.map((page) => [page.slug, renderGuide(map, page, site)]));
  assert.match(pages.index, /npm install -g @chittr\/cli/);
  assert.match(pages.index, /Edits, commands and network access start off/);
  assert.match(pages.configuration, /version: 1\nhuman:/);
  assert.match(pages.configuration, /version: 1\nagents:\n  astra:/);
  assert.match(pages.configuration, /A project file can't grant trust/);
  assert.match(pages.configuration, /Trusted commands can change them/);
  assert.match(pages.usage, /Stop does not roll back file edits or command side effects/);
  assert.match(pages.usage, /Failed and interrupted deliveries still need <code>\/retry<\/code>/);
  assert.match(pages.usage, /gets nothing from that message, not even the caption/);
  const tables = { index: ['requirements', 'install', 'troubleshooting'], configuration: ['settings', 'participants', 'permissions'], usage: ['cli', 'controls', 'keyboard'] };
  for (const [slug, ids] of Object.entries(tables)) for (const id of ids) {
    const section = pages[slug].split(`<section id="${id}"`)[1].split('</section>')[0];
    assert.match(section, /<table>\n<thead>[\s\S]*<tbody>/, `${slug}#${id}`);
  }
  for (const html of Object.values(pages)) {
    assert.match(html, /Documented release/);
    assert.match(html, new RegExp(map.commit));
    assert.doesNotMatch(html, /<p>\||Release source|blob\/main\/|npm run test:|#85|#105/);
    for (const section of html.match(/<section[\s\S]*?<\/section>/g)) assert.doesNotMatch(section, /github\.com|href="[^"]*\.md/);
  }
});

// Inline code and code-block lines from Markdown, where commands and settings are written.
function codeOf(text, info) {
  const result = [];
  const visit = (tokens) => {
    for (const token of tokens) {
      if (token.type === 'code_inline' && info === undefined) result.push(token.content);
      if (token.type === 'fence' && (info === undefined || token.info === info)) result.push(...token.content.split('\n'));
      if (token.children) visit(token.children);
    }
  };
  visit(markdown.parse(text, {}));
  return result;
}

test('getting started states the release requirements, sign-in and update steps', () => {
  const page = site[pageOf('index').file];
  const node = /Node\.js (\d+\.\d+\.\d+)[\s>]+or newer/.exec(sources['README.md']);
  assert.ok(node && page.includes(`${node[1]} or newer`), 'Node.js minimum');
  const codex = /Codex adapter requires CLI (\S+) or newer/.exec(sources['docs/installation.md']);
  assert.ok(codex && page.includes(`${codex[1]} or newer`), 'Codex CLI minimum');
  const signIn = codeOf(sources['README.md']).filter((code) => /^(codex|claude|grok) .*login$/.test(code));
  assert.ok(signIn.length >= 2);
  // The README's quick start names the update command for npm-global installs.
  assert.ok(codeOf(sources['README.md']).some((line) => line.startsWith('chittr update')), 'chittr update in the release README');
  for (const command of [...signIn, 'npm install -g @chittr/cli', 'chittr update']) assert.ok(codeOf(page).includes(command), command);
});

// Room commands, /attach actions, chittr subcommands and chittr flags named in code.
function commandsIn(code) {
  const found = new Set();
  for (const text of code) {
    const room = /^\/([a-z][a-z-]*)(?=\s|$)/.exec(text);
    if (room) found.add(`/${room[1]}`);
    const attach = /^\/attach (--[a-z]+)/.exec(text);
    if (attach) found.add(`/attach ${attach[1]}`);
    const sub = /^chittr ([a-z]+)/.exec(text);
    if (sub) found.add(`chittr ${sub[1]}`);
    if (/^(chittr\b|--[a-z])/.test(text)) for (const [flag] of text.matchAll(/--[a-z][a-z-]*/g)) found.add(flag);
  }
  return found;
}

test('usage reference covers every command in the pinned release and invents none', () => {
  const usage = pageOf('usage');
  const release = commandsIn(usage.references.flatMap((file) => codeOf(sources[file])));
  // Flag-like code in the documents that is not a chittr option.
  const notChittrFlags = { '--effort': "Claude Code's flag", '--reasoning-effort': "Grok Build's flag", '--list': 'a file name in an /attach example' };
  for (const flag of Object.keys(notChittrFlags)) release.delete(flag);
  const page = commandsIn(codeOf(site[usage.file]));
  const missing = [...release].filter((command) => !page.has(command));
  assert.deepEqual(missing, [], 'Document these release commands on the usage page');
  // `chittr doctor --json` appears only in the released CLI's --help output.
  const unknown = [...page].filter((command) => !release.has(command) && command !== '--json');
  assert.deepEqual(unknown, [], 'These commands are not in the pinned release documents');
  for (const command of ['/pause', '/attach --status', 'chittr resume', '--trusted-commands']) assert.ok(release.has(command), command);
});

// Dotted key paths in YAML, with participant names as `*`.
function yamlKeys(lines) {
  const keys = new Set();
  const stack = [];
  for (const line of lines) {
    const match = /^(\s*)(- )?([A-Za-z_][\w-]*):(?:\s|$)/.exec(line);
    if (!match) continue;
    const indent = match[1].length + (match[2] ? 2 : 0);
    while (stack.length && stack.at(-1).indent >= indent) stack.pop();
    const parent = stack.map((entry) => entry.key);
    const key = ['agents', 'defaultAgents'].includes(parent.at(-1)) ? '*' : match[3];
    stack.push({ indent, key });
    keys.add([...parent, key].join('.'));
  }
  return keys;
}

// Setting names from YAML examples and dotted keys such as `human.name`.
function settingsIn(yamlLines, code) {
  const paths = [...yamlKeys(yamlLines), ...code.filter((text) => /^[a-z][A-Za-z_]*(\.[a-z][A-Za-z_]*)+$/.test(text))];
  return new Set(paths.flatMap((path) => path.split('.')).filter((name) => name !== '*'));
}

test('configuration reference covers every documented setting and invents none', () => {
  const configuration = pageOf('configuration');
  const docs = configuration.references.filter((file) => file.endsWith('.md'));
  const examples = configuration.references.filter((file) => file.endsWith('.yaml'));
  const release = settingsIn([...docs.flatMap((file) => codeOf(sources[file], 'yaml')), ...examples.flatMap((file) => sources[file].split('\n'))], docs.flatMap((file) => codeOf(sources[file])));
  const text = site[configuration.file];
  const page = settingsIn(codeOf(text, 'yaml'), codeOf(text));
  const mentioned = new Set([...page, ...codeOf(text)]);
  assert.deepEqual([...release].filter((name) => !mentioned.has(name)), [], 'Document these release settings on the configuration page');
  assert.deepEqual([...page].filter((name) => !release.has(name)), [], 'These settings are not in the pinned release documents');
  for (const name of ['follow_up_turns', 'defaultAgents', 'trustedCommands', 'workspaces', 'mode']) assert.ok(release.has(name), name);
  // Effort levels are a closed list per provider; the page must match the release table.
  const levels = (source) => Object.fromEntries([...source.matchAll(/^\| (Codex|Claude|Grok)\s*\| (`[^|]+?)\s*\|$/gm)].map(([, provider, list]) => [provider, list]));
  assert.equal(Object.keys(levels(sources['docs/configuration.md'])).length, 3);
  assert.deepEqual(levels(text), levels(sources['docs/configuration.md']));
});

test('guide pages need section ids and link only to guide sections or vendor sites', () => {
  assert.throws(() => parseSitePage('Intro\n\n## One {#one}\n'), /start with a section heading/);
  assert.throws(() => parseSitePage('## One\n'), /unique \{#id\}/);
  assert.throws(() => parseSitePage('## One {#one}\n\n## Two {#one}\n'), /unique \{#id\}/);
  assert.throws(() => parseSitePage('# Title\n\n## One {#one}\n'), /title from the source map/);
  assert.deepEqual(parseSitePage('## One {#one}\n\nText.\n\n### Detail\n\n## Two {#two}\n').map(({ id, title }) => [id, title]), [['one', 'One'], ['two', 'Two']]);
  const usage = pageOf('usage');
  const withLink = (link) => ({ ...site, [usage.file]: `${site[usage.file]}\n${link}\n` });
  for (const link of ['[x](#cli)', '[x](/guide/configuration/#permissions)', '[x](/guide/)', '[x](https://docs.npmjs.com/)']) checkGuideLinks(map, withLink(link));
  for (const link of ['[x](#nope)', '[x](/guide/configuration/#nope)', '[x](/guide/missing/)', '[x](docs/usage.md)', '[x](http://example.com)', '[x](https://github.com/chittr/chittr/blob/v0.2.0/docs/usage.md)']) {
    assert.throws(() => checkGuideLinks(map, withLink(link)), /Unsupported guide link/, link);
  }
  assert.throws(() => renderGuide(map, usage, {}), /Missing guide page/);
  assert.equal(markdown.render('<script>alert(1)</script>\n'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n');
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
    const usagePath = join(fixture, 'guide', pageOf('usage').file);
    for (const fault of ['pin', 'unexpected-source', 'broken-link']) {
      const changed = structuredClone(fixtureMap);
      if (fault === 'pin') changed.commit = '0'.repeat(40);
      else if (fault === 'unexpected-source') changed.pages[0].references.push('docs/absent.md');
      else await writeFile(usagePath, `${site[pageOf('usage').file]}\nSee [the source](docs/usage.md).\n`);
      await writeFile(mapPath, JSON.stringify(changed));
      result = refresh(); assert.notEqual(result.status, 0, fault);
      assert.match(result.stderr, /nothing replaced|Unexpected guide source|Unsupported guide link/);
      await writeFile(usagePath, site[pageOf('usage').file]);
      const after = await tree(join(fixture, 'guide'));
      delete after['source-map.json'];
      const before = { ...saved }; delete before['source-map.json'];
      assert.deepEqual(after, before, `${fault} changed saved sources`);
    }
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test('build rejects corrupt, missing or stale snapshots before replacing existing output', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'chittr-guide-test-'));
  try {
    await cp(join(root, 'scripts'), join(fixture, 'scripts'), { recursive: true });
    await cp(join(root, 'guide'), join(fixture, 'guide'), { recursive: true });
    await cp(join(root, 'dist'), join(fixture, 'dist'), { recursive: true });
    await symlink(join(root, 'node_modules'), join(fixture, 'node_modules'));
    const before = await tree(join(fixture, 'dist'));
    const build = () => spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture, encoding: 'utf8' });
    const source = join(fixture, 'guide/upstream/README.md');
    const original = await readFile(source, 'utf8');
    await writeFile(source, original + '\nunauthorized content\n');
    let run = build();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Changed upstream snapshot/);
    assert.deepEqual(await tree(join(fixture, 'dist')), before);
    await writeFile(source, original);
    const provenancePath = join(fixture, 'guide/provenance.json');
    const provenance = await readFile(provenancePath, 'utf8');
    const partial = JSON.parse(provenance); delete partial.files['docs/usage.md'];
    await writeFile(provenancePath, JSON.stringify(partial));
    run = build();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Missing release snapshot: docs\/usage\.md/);
    assert.deepEqual(await tree(join(fixture, 'dist')), before);
    await writeFile(provenancePath, provenance);
    const changedMap = structuredClone(map); changedMap.commit = '0'.repeat(40);
    await writeFile(join(fixture, 'guide/source-map.json'), JSON.stringify(changedMap));
    run = build();
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /pin does not match/);
    assert.deepEqual(await tree(join(fixture, 'dist')), before);
    assert.equal(blobHash(original), JSON.parse(provenance).files['README.md']);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
