import MarkdownIt from 'markdown-it';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const guideRoot = new URL('../guide/', import.meta.url);
export const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
const escape = markdown.utils.escapeHtml;
export const blobHash = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');

export function validateMap(map) {
  if (map.repository !== 'chittr/chittr' || !/^v\d+\.\d+\.\d+(?:[-.][a-zA-Z0-9.-]+)?$/.test(map.tag) || !/^[a-f0-9]{40}$/.test(map.commit)) {
    throw new Error('Expected chittr/chittr, an explicit release tag and a full commit SHA');
  }
  const ids = new Set();
  for (const page of map.pages) {
    if (!/^(index|configuration|usage)$/.test(page.slug) || ids.has(page.slug)) throw new Error('Invalid or duplicate guide page');
    ids.add(page.slug);
    const sections = new Set();
    for (const section of page.sections) {
      if (!/^[a-z][a-z0-9-]*$/.test(section.id) || sections.has(section.id)) throw new Error('Invalid or duplicate section');
      sections.add(section.id);
      for (const part of section.passages) {
        if (!/^(README\.md|docs\/(installation|compatibility)\.md)$/.test(part.file)) throw new Error('Unexpected guide source');
      }
    }
  }
  if (ids.size !== 3) throw new Error('The guide requires all three entry points');
}

export function selectPassage(part, sources) {
  const text = sources[part.file];
  if (text === undefined) throw new Error(`Missing source: ${part.file}`);
  const lines = text.split('\n');
  const { start, end, heading, first, last } = part;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) throw new Error(`Invalid range: ${part.file}`);
  const actualHeading = markdown.parse(text, {}).filter((token) => token.type === 'heading_open' && token.map[0] < start).map((token) => lines[token.map[0]]).at(-1);
  if (actualHeading !== heading || lines[start - 1] !== first || lines[end - 1] !== last) {
    throw new Error(`Source selection moved or missing: ${part.file}:${start}-${end} (${heading})`);
  }
  let selected = lines.slice(start - 1, end).join('\n');
  if (part.exactSpans) {
    selected = part.exactSpans.map((span) => {
      if (!selected.includes(span) || selected.indexOf(span) !== selected.lastIndexOf(span)) throw new Error('Missing or ambiguous exact source span');
      return span;
    }).join('\n\n');
  }
  return selected + '\n';
}

// GitHub-style heading fragments for the pinned Markdown targets we link to.
function anchors(text) {
  const result = new Set();
  const counts = new Map();
  const tokens = markdown.parse(text, {});
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const plain = tokens[i + 1].children.filter((token) => ['text', 'code_inline'].includes(token.type)).map((token) => token.content).join('');
    const base = plain.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const count = counts.get(base) ?? 0;
    result.add(base + (count ? `-${count}` : ''));
    counts.set(base, count + 1);
  }
  return result;
}

export function appTarget(href, file, map) {
  const prefix = `https://github.com/${map.repository}/blob/`;
  let target;
  if (href.startsWith(prefix)) {
    const rest = href.slice(prefix.length);
    const ref = rest.slice(0, rest.indexOf('/'));
    if (!['main', map.tag, map.commit].includes(ref)) throw new Error(`Unexpected app reference: ${href}`);
    target = new URL(rest.slice(ref.length + 1), 'https://source.invalid/');
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith('//')) {
    target = new URL(href, `https://source.invalid/${file}`);
  } else {
    if (!/^https:\/\//.test(href)) throw new Error(`Unsupported documentation link: ${href}`);
    return null;
  }
  if (target.search) throw new Error(`Unexpected source query: ${href}`);
  return { file: decodeURIComponent(target.pathname.slice(1)), fragment: decodeURIComponent(target.hash.slice(1)) };
}

function walk(tokens, visit) {
  for (const token of tokens) {
    visit(token);
    if (token.children) walk(token.children, visit);
  }
}

export function requiredTargets(map, sources) {
  const files = new Set(['LICENSE']);
  for (const page of map.pages) for (const section of page.sections) for (const part of section.passages) {
    files.add(part.file);
    walk(markdown.parse(selectPassage(part, sources), {}), (token) => {
      if (token.type === 'link_open') {
        const target = appTarget(token.attrGet('href'), part.file, map);
        if (target) files.add(target.file);
      }
      if (token.type === 'image') throw new Error('Guide source images require an explicit asset import');
    });
  }
  return [...files].sort();
}

function renderPassage(part, sources, map) {
  const tokens = markdown.parse(selectPassage(part, sources), {});
  walk(tokens, (token) => {
    if (token.type === 'link_open') {
      const target = appTarget(token.attrGet('href'), part.file, map);
      if (!target) return;
      if (sources[target.file] === undefined) throw new Error(`Unverified source link: ${target.file}`);
      if (target.fragment && !anchors(sources[target.file]).has(target.fragment)) throw new Error(`Unverified source fragment: ${target.file}#${target.fragment}`);
      token.attrSet('href', `https://github.com/${map.repository}/blob/${map.commit}/${target.file}${target.fragment ? `#${target.fragment}` : ''}`);
    }
    if (token.type === 'image') throw new Error('Guide source images are not imported');
  });
  return markdown.renderer.render(tokens, markdown.options, {});
}

const fence = markdown.renderer.rules.fence;
markdown.renderer.rules.fence = (tokens, index, options, env, self) => `<div class="guide-code" data-copy>${fence(tokens, index, options, env, self)}<button class="copy" type="button" hidden aria-label="Copy example">Copy</button><span class="copy-status" role="status"></span></div>`;
markdown.renderer.rules.table_open = () => '<div class="guide-table" role="region" aria-label="Reference table" tabindex="0"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';

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
  requiredTargets(map, sources);
  return { map, sources };
}

export function renderGuide(map, sources, page) {
  const url = (item) => item.slug === 'index' ? '/guide/' : `/guide/${item.slug}/`;
  const navigation = map.pages.map((item) => `<a href="${url(item)}"${item === page ? ' aria-current="page"' : ''}>${escape(item.title)}</a>`).join('');
  const contents = page.sections.map((section) => `<li><a href="#${section.id}">${escape(section.title)}</a></li>`).join('');
  const sections = page.sections.map((section) => `<section id="${section.id}" class="guide-section"><h2><a href="#${section.id}">${escape(section.title)}</a></h2>${section.passages.map((part) => renderPassage(part, sources, map)).join('\n')}<p class="source-ref">Release source: ${section.passages.map((part) => `<a href="https://github.com/${map.repository}/blob/${map.commit}/${part.file}#L${part.start}-L${part.end}">${escape(part.file)} · ${part.start}–${part.end}</a>`).join(' · ')}</p></section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(page.title)} · Chittr guide</title><meta name="description" content="${escape(page.intro)}"><link rel="icon" href="/assets/chittr.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/guide.css"><script src="/copy.js" defer></script></head>
<body class="guide-page"><a class="skip" href="#main">Skip to content</a>
<header class="top"><a class="wordmark" href="/"><img src="/assets/chittr.svg" alt="" width="28" height="28"><span>chittr</span></a><nav aria-label="Site"><a href="/">Home</a><a href="/guide/" aria-current="location">Guide</a><a href="https://github.com/chittr/chittr">GitHub</a></nav></header>
<div class="guide-layout"><aside class="guide-sidebar"><p class="guide-label">Chittr guide</p><nav class="guide-pages" aria-label="Guide">${navigation}</nav><nav class="guide-contents" aria-label="On this page"><p>On this page</p><ol>${contents}</ol></nav></aside>
<main id="main" class="guide-main"><header class="guide-heading"><p class="release">Documented release <a href="https://github.com/${map.repository}/tree/${map.commit}">${escape(map.tag)}</a></p><h1>${escape(page.title)}</h1><p class="lede">${escape(page.intro)}</p><p class="guide-note">These instructions describe ${escape(map.tag)}. Check <code>chittr --version</code> against this release. Vendor setup links describe their current products.</p></header>${sections}<nav class="guide-pages guide-bottom" aria-label="More in the guide">${navigation}</nav></main></div>
<footer class="foot"><p>Documentation from Chittr ${escape(map.tag)}, published under the <a href="/guide/LICENSE.txt">MIT licence</a>. <a href="/">Back to the homepage</a>.</p></footer></body></html>\n`;
}
