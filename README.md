# Chittr website

Public homepage for [chittr.dev](https://chittr.dev). The CLI and its browser interface live in [chittr/chittr](https://github.com/chittr/chittr).

This is a static site with no runtime or build dependencies. `npm run build` copies only `index.html`, `styles.css`, `script.js`, and `assets/` into `dist/` for publication.

## Local preview

```sh
npm run check
npm run build
python3 -m http.server 8765 --directory dist
```

Open `http://localhost:8765/?instant` to see the completed hero transcript. Without `?instant`, the transcript animates unless the browser prefers reduced motion.

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
