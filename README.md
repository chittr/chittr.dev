# Chittr website

Public homepage for [chittr.dev](https://chittr.dev). The CLI and its browser interface live in [chittr/chittr](https://github.com/chittr/chittr).

This is a static site with no browser runtime dependencies. Every page loads `analytics.js`, which adds Google Analytics on `chittr.dev` and `www.chittr.dev` only, so local previews, tests and branch deployments record nothing. The guide uses a pinned Markdown renderer at build time. `npm run build` stages the homepage assets, three rendered guide pages and the app documentation licence through an explicit publication allowlist. Raw source snapshots, provenance and tooling stay out of `dist/`.

## Local preview

```sh
npm ci
npm run check
npm test
npm run build
python3 -m http.server 8765 --directory dist
```

Open `http://localhost:8765/?instant` to see the completed hero transcript. Without `?instant`, the transcript animates unless the browser prefers reduced motion.

The guide starts at `http://localhost:8765/guide/`. After stopping the manual server, `npm run test:browser` runs the desktop/mobile, light/dark, keyboard, clipboard and no-JavaScript checks. It uses installed Google Chrome and Python 3. Screenshots are saved in ignored `test-results/`.

## Update the guide

The guide's three pages are written here, in `guide/pages/`, for one pinned app release. `guide/source-map.json` names that release's tag and full commit, plus each page's title, intro, Markdown file and `references`: the release files the page is checked against. Snapshots of those files live in `guide/upstream/`, and `guide/provenance.json` records their Git blob hashes. The app licence is published at `/guide/LICENSE.txt`. The app repository stays authoritative for behavior.

In a page file, each `## Title {#id}` heading starts a section, and the id is its anchor. Pages are a reference for developers: a short explanation and a table per task. They don't cite or link to app source files. Links go to other guide sections, which the build checks, or to vendor sites.

`npm test` checks the pages against the snapshots:

- Usage names every room command, `/attach` action, `chittr` subcommand and flag in its references, and no others. `chittr doctor --json` is the exception, because only `chittr --help` documents it.
- Configuration names every setting in the configuration guide and examples, and no others. Its effort levels match the release table.
- Getting started gives the release's Node.js minimum, tested versions, Codex CLI minimum and sign-in commands.

The tests catch names and numbers, not changed descriptions.

Normal builds use only checked-in snapshots and installed dependencies. They fetch nothing and need no GitHub credentials. `npm ci` is the separate dependency-install step. HTML in page Markdown is escaped, and code blocks are never executed.

### Refresh snapshots

To refresh from the same release, use a local checkout of `chittr/chittr` with the selected tag available. Fetching that public tag is an explicit prerequisite, using your normal Git identity. Agents use their assigned identity wrapper. The helper only reads that checkout; it neither fetches nor changes its branch.

```sh
npm run refresh:guide -- --checkout /absolute/path/to/chittr
npm run check
npm test
npm run build
git diff -- guide
```

Refreshing the same pin twice must leave an empty `git diff -- guide` and identical built output. To compare builds, copy `dist/` to a temporary directory before repeating refresh/build and run `diff -r <previous-dist> dist`.

Refresh reads every referenced file at the pinned commit and checks the pages' links before replacing anything. A tag that doesn't resolve to the pinned commit, a reference outside the allowed source files, a missing file or a broken guide link exits nonzero and leaves snapshots unchanged.

### Document a new release

1. Resolve the tag with `git -C /path/to/chittr rev-parse 'refs/tags/<tag>^{commit}'`.
2. Update `tag` and `commit` in `guide/source-map.json`, and the version the homepage advertises.
3. Run refresh, then `npm test`. Failures name the commands or settings to add or remove, and the requirements that changed.
4. Read the release's `CHANGELOG.md` and `git diff -- guide/upstream` for behavior, limits and wording the tests can't see, and update the pages.
5. Build, and read the pages in a browser.

Before merging the implementation PR, inspect its branch preview after redirects: `/guide/`, `/guide/configuration/`, `/guide/usage/`, direct section links, homepage/back links and assets. Keep screenshots and validation evidence with the PR. This does not require changing Pages configuration or production DNS.

## Deployment

Cloudflare Pages builds this site from GitHub with these settings:

| Setting | Value |
| --- | --- |
| Repository | `chittr/chittr.dev` |
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Output directory | `dist` |
| Build watch paths | All files |

Run the local check and build before pushing. Check a branch preview before merging to `main`, then confirm the production deployment uses the merged commit and serves the expected content at `https://chittr.dev` and `https://www.chittr.dev`.

Bill maintains the Cloudflare and GitHub connection. The existing Pages project is `chittr`, as recorded in `wrangler.jsonc`. During the repository move, verify the new Git connection and build before removing the old source or changing the production domains. Routine website edits need no DNS changes.

## Editing

- Fonts load from Google Fonts with system fallbacks.
- Participant colours are CSS custom properties applied through `data-agent` attributes.
- The hero transcript is scripted in `script.js`.
- Light and dark palettes follow the browser preference or `data-theme="dark"` on the root element.
- Product links reference `github.com/chittr/chittr` and `@chittr/cli`.
