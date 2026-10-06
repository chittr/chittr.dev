import MarkdownIt from 'markdown-it';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const guideRoot = new URL('../guide/', import.meta.url);
export const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
const escape = markdown.utils.escapeHtml;
export const blobHash = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');

const sourceFile = /^(README\.md|PRIVACY\.md|docs\/(installation|configuration|usage|terminal-images)\.md|examples\/(user|project|three-providers)\.yaml)$/;
const pageUrl = (page) => page.slug === 'index' ? '/guide/' : `/guide/${page.slug}/`;

export function validateMap(map) {
  if (map.repository !== 'chittr/chittr' || !/^v\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9.-]+)?$/.test(map.tag) || !/^[a-f0-9]{40}$/.test(map.commit)) {
    throw new Error('Expected chittr/chittr, an explicit release tag and a full commit SHA');
  }
  const ids = new Set();
  for (const page of map.pages) {
    if (!/^(index|configuration|usage)$/.test(page.slug) || ids.has(page.slug)) throw new Error('Invalid or duplicate guide page');
    ids.add(page.slug);
    // Pages are written here and checked against the pinned release files they reference.
    if (!/^pages\/[a-z-]+\.md$/.test(page.file) || !page.references?.length) throw new Error('Invalid guide page');
    for (const file of page.references) if (!sourceFile.test(file)) throw new Error('Unexpected guide source');
  }
  if (ids.size !== 3) throw new Error('The guide requires all three entry points');
}

// The release files the pages are checked against, plus the licence published with the guide.
export const requiredSources = (map) => [...new Set(['LICENSE', ...map.pages.flatMap((page) => page.references)])].sort();

// A page is Markdown whose `## Title {#id}` headings start its sections.
export function parseSitePage(text) {
  const lines = text.split('\n');
  const headings = markdown.parse(text, {}).filter((token) => token.type === 'heading_open');
  if (headings.some((token) => token.tag === 'h1')) throw new Error('Guide pages take their title from the source map');
  const starts = headings.filter((token) => token.tag === 'h2').map((token) => token.map[0]);
  if (!starts.length || lines.slice(0, starts[0]).some((line) => line.trim())) throw new Error('Guide pages start with a section heading');
  const ids = new Set();
  return starts.map((start, i) => {
    const match = /^## (.+) \{#([a-z][a-z0-9-]*)\}$/.exec(lines[start]);
    if (!match || ids.has(match[2])) throw new Error(`Section heading needs a unique {#id}: ${lines[start]}`);
    ids.add(match[2]);
    return { id: match[2], title: match[1], markdown: lines.slice(start + 1, starts[i + 1]).join('\n') };
  });
}

function walk(tokens, visit) {
  for (const token of tokens) {
    visit(token);
    if (token.children) walk(token.children, visit);
  }
}

// Pages link to other guide sections or vendor documentation, never to app source files.
export function checkGuideLinks(map, site) {
  const sections = new Map(map.pages.map((page) => [pageUrl(page), new Set(parseSitePage(site[page.file]).map((section) => section.id))]));
  for (const page of map.pages) {
    walk(markdown.parse(site[page.file], {}), (token) => {
      if (token.type === 'image') throw new Error('Guide pages do not embed images');
      if (token.type !== 'link_open') return;
      const href = token.attrGet('href');
      if (/^https:\/\//.test(href) && !/^https:\/\/(www\.)?github\.com\//.test(href)) return;
      const [path, fragment] = href.startsWith('#') ? [pageUrl(page), href.slice(1)] : href.split('#');
      if (!sections.has(path) || (fragment !== undefined && !sections.get(path).has(fragment))) throw new Error(`Unsupported guide link in ${page.file}: ${href}`);
    });
  }
}

const fence = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, options, env, self) => `<div class="guide-code" data-copy>${fence(tokens, index, options, env, self)}<button class="copy" type="button" hidden aria-label="Copy example">Copy</button><span class="copy-status" role="status"></span></div>`;
markdown.renderer.rules.table_open = () => '<div class="guide-table" role="region" aria-label="Reference table" tabindex="0"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';
// Label each cell with its column header, so narrow screens can stack table rows.
markdown.core.ruler.push('cell_labels', (state) => {
  let labels = [];
  let column = 0;
  state.tokens.forEach((token, index) => {
    if (token.type === 'thead_open') labels = [];
    if (token.type === 'th_open') labels.push(state.tokens[index + 1].content);
    if (token.type === 'tr_open') column = 0;
    if (token.type === 'td_open') token.attrSet('data-label', labels[column++] ?? '');
  });
});

export async function loadGuide(root = guideRoot) {
  const map = JSON.parse(await readFile(new URL('source-map.json', root), 'utf8'));
  const provenance = JSON.parse(await readFile(new URL('provenance.json', root), 'utf8'));
  validateMap(map);
  if (provenance.commit !== map.commit || provenance.tag !== map.tag || provenance.repository !== map.repository) throw new Error('Source pin does not match provenance; refresh the guide');
  const sources = {};
  for (const [file, hash] of Object.entries(provenance.files)) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(file) || file.split('/').includes('..') || file.startsWith('/')) throw new Error('Unsafe source path');
    sources[file] = await readFile(new URL(`upstream/${file}`, root), 'utf8');
    if (blobHash(sources[file]) !== hash) throw new Error(`Changed upstream snapshot: ${file}`);
  }
  for (const file of requiredSources(map)) if (sources[file] === undefined) throw new Error(`Missing release snapshot: ${file}; refresh the guide`);
  const site = await loadSite(map, root);
  checkGuideLinks(map, site);
  return { map, sources, site };
}

export async function loadSite(map, root = guideRoot) {
  const site = {};
  for (const page of map.pages) site[page.file] = await readFile(new URL(page.file, root), 'utf8');
  return site;
}

export function renderGuide(map, page, site) {
  if (site[page.file] === undefined) throw new Error(`Missing guide page: ${page.file}`);
  const parts = parseSitePage(site[page.file]);
  const navigation = map.pages.map((item) => `<a href="${pageUrl(item)}"${item === page ? ' aria-current="page"' : ''}>${escape(item.title)}</a>`).join('');
  const contents = parts.map((section) => `<li><a href="#${section.id}">${escape(section.title)}</a></li>`).join('');
  const sections = parts.map((section) => `<section id="${section.id}" class="guide-section"><h2><a href="#${section.id}">${escape(section.title)}</a></h2>${markdown.render(section.markdown)}</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(page.title)} · Chittr guide</title><meta name="description" content="${escape(page.intro)}"><link rel="icon" href="/assets/chittr.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/guide.css"><script src="/copy.js" defer></script></head>
<body class="guide-page"><a class="skip" href="#main">Skip to content</a>
<header class="top"><a class="wordmark" href="/"><img src="/assets/chittr.svg" alt="" width="28" height="28"><span>chittr</span></a><nav aria-label="Site"><a href="/">Home</a><a href="/guide/" aria-current="location">Guide</a></nav></header>
<div class="guide-layout"><aside class="guide-sidebar"><p class="guide-label">Chittr guide</p><nav class="guide-pages" aria-label="Guide">${navigation}</nav><nav class="guide-contents" aria-label="On this page"><p>On this page</p><ol>${contents}</ol></nav></aside>
<main id="main" class="guide-main"><header class="guide-heading"><p class="release">Documented release <a href="https://github.com/${map.repository}/tree/${map.commit}">${escape(map.tag)}</a></p><h1>${escape(page.title)}</h1><p class="lede">${escape(page.intro)}</p><p class="guide-note">These instructions describe ${escape(map.tag)}. Check <code>chittr --version</code> against this release. Vendor setup links describe their current products.</p></header>${sections}<nav class="guide-pages guide-bottom" aria-label="More in the guide">${navigation}</nav></main></div>
<footer class="foot"><p>A guide to Chittr ${escape(map.tag)}, which is published under the <a href="/guide/LICENSE.txt">MIT licence</a>. <a href="/">Back to the homepage</a>.</p></footer></body></html>\n`;
}
