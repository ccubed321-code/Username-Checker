# Username Availability Checker — standalone site

A small, zero-dependency Node.js website. Type a username and it checks that
name live across 10 platforms (TikTok, Instagram, YouTube, Twitch, X,
Snapchat, GitHub, Steam, Pinterest, Reddit) and reports each one as
Available, Taken, Couldn't verify, or Not allowed (breaks that platform's
name rules). Platforms that block automated checks (X, Reddit, and usually
Instagram) honestly say "couldn't verify" instead of guessing.

## Run it locally

You need Node.js 18 or newer.

```
node server.js
```

Then open http://localhost:3000

## Put it on the internet (free)

### Option A: Render (has a free tier)
1. Put this folder in a GitHub repository (free account).
2. On render.com: New → Web Service → connect the repo.
   (Or New → Blueprint and it reads `render.yaml` from this folder.)
3. Build command: leave empty. Start command: `node server.js`.
4. Deploy. You get a public address like `your-app.onrender.com`.

Railway and most other Node hosts work the same way: no build step,
start command `node server.js`, and they set the PORT variable for you.

### Option B: add your own domain (about $10–15/year, later)
Buy the domain from any registrar, then follow your host's "custom domain"
instructions to point it at the deployed app. A custom domain matters
because ad networks (below) generally want your own domain before approval.

## Turn on the money

1. **Domain affiliate link (the main earner).** Join a registrar affiliate
   program (for example Namecheap Affiliate — free to join). In
   `public/index.html`, near the top of the script, replace
   `DOMAIN_LINK_TEMPLATE` with your affiliate link template. The
   "Check the .com" box under the results is what earns the commission
   when a visitor buys the matching domain.
2. **Ads.** After your site is live on your own domain, apply to Google
   AdSense (free). Once approved, paste the ad code they give you into the
   boxes marked `AD SLOT` in `public/index.html`.

## Files

- `server.js` — the whole backend: static page + `/api/check` lookups.
- `public/index.html` — the page, styles, and owner settings.
- `render.yaml` — one-click deploy settings for Render.
- `package.json` — just the start command; there are no dependencies to install.
