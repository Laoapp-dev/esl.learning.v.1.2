# Deploying to Cloudflare Pages

This app already works on Cloudflare Pages with no code changes needed —
it uses a relative build path (`base: './'` in `vite.config.ts`) and
`HashRouter`, so it doesn't care whether it's served from a GitHub Pages
subpath, a Cloudflare Pages `*.pages.dev` subdomain, or a custom domain
root. Pick ONE of the two setup methods below — don't run both, or you'll
end up with two separate deploys of the same site.

## Option A — Cloudflare dashboard (simplest, no secrets/YAML needed)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick this repo.
2. Framework preset: **Vite** (Cloudflare auto-fills the next two fields
   when you pick this).
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Environment variables (optional, only if you use build-time Google
   Sheet auto-sync — most setups don't need this, see
   `MIGRATION_GUIDE.md`):
   - `VITE_SHEET_CSV_URL`
   - `VITE_SHEET_AUTO_SYNC_MIN`
6. Save and deploy. Every push to `main` redeploys automatically from now
   on — nothing else to configure.

## Option B — GitHub Actions (`.github/workflows/deploy-cloudflare.yml`)

Use this if you'd rather keep deploys visible in GitHub's Actions tab
alongside your other workflow, or need finer control over the build step.

1. Get a Cloudflare API token: Cloudflare dashboard → your profile icon →
   **My Profile** → **API Tokens** → **Create Token** → use the **"Edit
   Cloudflare Workers"** template (it includes Pages) — or create a custom
   token with **Account → Cloudflare Pages → Edit** permission.
2. Get your Account ID: Cloudflare dashboard → **Workers & Pages** → it's
   shown in the right sidebar.
3. In your GitHub repo → **Settings → Secrets and variables → Actions** →
   add two repository secrets:
   - `CLOUDFLARE_API_TOKEN` — the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` — the ID from step 2
4. In Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages**
   → **Upload assets** → name the project `esl-master-vocab` (must match
   `projectName` in `deploy-cloudflare.yml`, and `name` in `wrangler.toml`
   if you rename it) — this just creates the empty project once; the
   Action fills it on every push after that.
5. Push to `main`. GitHub repo → **Actions** tab → watch "Deploy to
   Cloudflare Pages" run and finish green.

You can also deploy manually from your own machine any time with:
```
npm run build
npx wrangler pages deploy dist --project-name=esl-master-vocab
```

## PWA support (installable on laptop + phone)

Already fully configured, works identically on Cloudflare Pages:
- `manifest.webmanifest` — app name/icons/`display: 'standalone'` so it
  installs as a real app window on desktop (Chrome/Edge "Install app" in
  the address bar) and shows a native "Add to Home Screen" prompt on
  Android/iOS.
- Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`) —
  precaches the app shell for offline use and checks for updates on every
  visit.
- Icons for every required size (192/512, plus maskable variants for
  Android's adaptive icon shapes) already in `public/icons/`.
- `public/_headers` (new, this update) sets `no-cache` on `index.html`,
  `sw.js`, `registerSW.js`, and `manifest.webmanifest`, and long-cache on
  hashed `/assets/*` files. This matters MORE on Cloudflare than GitHub
  Pages — Cloudflare's edge cache is more aggressive by default, and
  without these rules a stale cached shell could stick around longer,
  which is exactly the kind of thing that causes a "stuck on old version"
  boot problem.

After deploying, verify on both a laptop and a phone:
- **Desktop (Chrome/Edge):** address bar shows an install icon → click it
  → app opens in its own window, not a browser tab.
- **Android (Chrome):** menu → "Install app" / "Add to Home Screen" →
  icon appears on the home screen, opens full-screen.
- **iOS (Safari):** Share button → "Add to Home Screen" → same result
  (iOS doesn't show an automatic install prompt like Android/desktop do —
  this manual step is normal Safari/iOS behavior, not a bug).

## Importing large word lists (10,000+) on Cloudflare Pages

No different from any other host — the shared curriculum is stored in
each learner's own browser (IndexedDB, not a server database — see
`useVocabulary.ts`), and pushed between devices via GitHub Sync
(`AdminPanel.tsx` → Import/Export / GitHub Sync tabs), which now handles
files well past 10,000 words end-to-end (see `CHANGELOG_v2.1.md` for the
localStorage → IndexedDB migration that fixed the old ~5,000-word ceiling).
Cloudflare Pages only serves the static app files — it isn't involved in
storing or syncing vocabulary data at all.
