# Chittr website

Public homepage for [chittr.dev](https://chittr.dev). The CLI and its browser interface live in [chittr/chittr](https://github.com/chittr/chittr).

This is a static site with no browser runtime dependencies. The guide uses a pinned Markdown renderer at build time. `npm run build` stages the homepage assets, three rendered guide pages and the app documentation licence through an explicit publication allowlist. Raw source snapshots, provenance and tooling stay out of `dist/`.

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

## Refresh the guide

The app repository is authoritative for behavior. `guide/source-map.json` separates site-authored titles/navigation from exact app passages. Each passage records its file, inclusive line range, containing Markdown heading and exact boundary lines; optional `exactSpans` select complete sentences within a paragraph. Behavioral wording is not edited here. `guide/provenance.json` records the release tag, full commit and Git blob hashes of snapshots and linked targets. The initial guide uses v0.1.0's README, because that release has no separate configuration or usage document.

Normal builds use only checked-in snapshots and installed dependencies. They fetch nothing and need no GitHub credentials. `npm ci` is the separate dependency-install step. HTML in imported Markdown is escaped; imported code blocks are never executed.

To refresh from the same release, use a local checkout of `chittr/chittr` with the selected tag available. Fetching that public tag is an explicit prerequisite, using your normal Git identity. Agents use their assigned identity wrapper. The helper only reads that checkout; it neither fetches nor changes its branch.

```sh
npm run refresh:guide -- --checkout /absolute/path/to/chittr
npm run check
npm test
npm run build
git diff -- guide
```

Refreshing the same pin twice must leave an empty `git diff -- guide` and identical built output. To compare builds, copy `dist/` to a temporary directory before repeating refresh/build and run `diff -r <previous-dist> dist`.

For another **existing release**, resolve its tag to the full commit with `git -C /path/to/chittr rev-parse 'refs/tags/<tag>^{commit}'`. Inspect that commit's documents, then deliberately update the source map's tag, SHA, ranges and boundary lines and the homepage's advertised version together. Keep prerequisites, examples, permission/trust caveats, recovery conditions and image limits complete. Select compaction separately from Development; do not import live-provider test commands. The map records the compatibility paragraph's sentence selections, which omit internal issue numbers and native tool lists without rewriting retained caveats.

Run refresh after changing the map. It validates the tag/SHA, selections and all imported app links, including fragments and absolute `blob/main` URLs, before replacing snapshots. An absent file, moved heading/boundary, invalid fragment or mismatched pin exits nonzero. Inspect the rendered pages and provenance diff; do not repair an error by substituting main or silently omitting a section. Changes to behavioral text belong in the app repository first. Licence text is refreshed from that same commit and published at `/guide/LICENSE.txt`.

Validate a missing-source failure in a disposable copy of this website: change one passage's `heading` to a nonexistent heading, run the refresh command and confirm a nonzero exit with `Source selection moved or missing`; snapshots and provenance must remain unchanged. Restore the map before building. Repeat with an incorrect SHA to verify the tag check. `npm test` also exercises moved selections, missing files/fragments, corrupt snapshots, provenance mismatches and publication boundaries.

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
