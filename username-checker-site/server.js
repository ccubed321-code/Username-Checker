// Username Availability Checker — standalone server (zero dependencies, Node 18+)
// Serves the checker page and does the platform lookups server-side at /api/check?u=NAME
// Results are honest: taken / available / unknown (platform blocks checks) / invalid (breaks platform rules).

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await r.text().catch(() => '');
    return { status: r.status, text };
  } finally {
    clearTimeout(timer);
  }
}

const taken = (note) => ({ status: 'taken', note: note || 'Profile exists' });
const avail = (note) => ({ status: 'available', note: note || 'No profile found' });
const unknown = (note) => ({ status: 'unknown', note });

function ogTitle(html) {
  const m = html.match(/property="og:title"\s+content="([^"]*)"/i) || html.match(/content="([^"]*)"\s+property="og:title"/i);
  return m ? m[1] : '';
}

const PLATFORMS = [
  {
    id: 'tiktok', name: 'TikTok',
    profile: (u) => `https://www.tiktok.com/@${u}`,
    signup: 'https://www.tiktok.com/signup',
    rule: (u) => (/^[A-Za-z0-9._]{2,24}$/.test(u) ? null : 'TikTok names are 2-24 chars: letters, numbers, dots, underscores'),
    check: async (u) => {
      const r = await fetchPage(`https://www.tiktok.com/@${encodeURIComponent(u)}`);
      const t = r.text;
      if (t.includes(`"uniqueId":"${u}"`) || t.toLowerCase().includes(`"uniqueid":"${u.toLowerCase()}"`)) return taken();
      if (/Couldn't find this account/i.test(t)) return avail();
      return unknown('TikTok did not give a clear answer');
    },
  },
  {
    id: 'instagram', name: 'Instagram',
    profile: (u) => `https://www.instagram.com/${u}/`,
    signup: 'https://www.instagram.com/accounts/emailsignup/',
    rule: (u) => (/^[A-Za-z0-9._]{1,30}$/.test(u) ? null : 'Instagram names are max 30 chars: letters, numbers, dots, underscores'),
    check: async (u) => {
      const r = await fetchPage(`https://www.instagram.com/${encodeURIComponent(u)}/`);
      if (/Sorry, this page isn't available/i.test(r.text)) return avail('Instagram shows its missing-profile page');
      return unknown('Instagram shows a login wall to automated checks');
    },
  },
  {
    id: 'youtube', name: 'YouTube',
    profile: (u) => `https://www.youtube.com/@${u}`,
    signup: 'https://accounts.google.com/signup',
    rule: (u) => (/^[A-Za-z0-9._-]{3,30}$/.test(u) ? null : 'YouTube handles are 3-30 chars: letters, numbers, dots, dashes, underscores'),
    check: async (u) => {
      const r = await fetchPage(`https://www.youtube.com/@${encodeURIComponent(u)}`);
      if (r.status === 404) return avail();
      if (r.status === 200) return taken();
      return unknown('YouTube did not give a clear answer');
    },
  },
  {
    id: 'twitch', name: 'Twitch',
    profile: (u) => `https://www.twitch.tv/${u}`,
    signup: 'https://www.twitch.tv/signup',
    rule: (u) => (/^[A-Za-z0-9_]{4,25}$/.test(u) ? null : 'Twitch names are 4-25 chars: letters, numbers, underscores'),
    check: async (u) => {
      const r = await fetchPage(`https://www.twitch.tv/${encodeURIComponent(u)}`);
      if (r.text.includes(`"login":"${u.toLowerCase()}"`)) return taken();
      const title = ogTitle(r.text);
      if (title && title.toLowerCase().includes(u.toLowerCase())) return taken();
      if (r.status === 404) return avail();
      return unknown('Twitch throttles automated checks');
    },
  },
  {
    id: 'x', name: 'X',
    profile: (u) => `https://x.com/${u}`,
    signup: 'https://x.com/i/flow/signup',
    rule: (u) => (/^[A-Za-z0-9_]{1,15}$/.test(u) ? null : 'X names are max 15 chars: letters, numbers, underscores'),
    check: async () => unknown('X blocks automated availability checks'),
  },
  {
    id: 'snapchat', name: 'Snapchat',
    profile: (u) => `https://www.snapchat.com/add/${u}`,
    signup: 'https://accounts.snapchat.com/accounts/signup',
    rule: (u) => (/^[A-Za-z][A-Za-z0-9._-]{2,14}$/.test(u) ? null : 'Snapchat names are 3-15 chars, must start with a letter'),
    check: async (u) => {
      const r = await fetchPage(`https://www.snapchat.com/add/${encodeURIComponent(u)}`);
      if (r.status === 404) return avail();
      if (r.status === 200) return taken();
      return unknown('Snapchat did not give a clear answer');
    },
  },
  {
    id: 'github', name: 'GitHub',
    profile: (u) => `https://github.com/${u}`,
    signup: 'https://github.com/signup',
    rule: (u) => (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(u) ? null : 'GitHub names are max 39 chars: letters, numbers, single hyphens'),
    check: async (u) => {
      const r = await fetchPage(`https://api.github.com/users/${encodeURIComponent(u)}`);
      if (r.status === 200) return taken();
      if (r.status === 404) return avail();
      // API rate-limited or unclear: fall back to the public profile page.
      const page = await fetchPage(`https://github.com/${encodeURIComponent(u)}`);
      if (page.status === 200) return taken();
      if (page.status === 404) return avail();
      return unknown('GitHub did not give a clear answer');
    },
  },
  {
    id: 'steam', name: 'Steam',
    profile: (u) => `https://steamcommunity.com/id/${u}`,
    signup: 'https://store.steampowered.com/join/',
    rule: () => null,
    check: async (u) => {
      const r = await fetchPage(`https://steamcommunity.com/id/${encodeURIComponent(u)}`);
      if (/The specified profile could not be found/i.test(r.text)) return avail();
      if (r.status === 200) return taken();
      return unknown('Steam did not give a clear answer');
    },
  },
  {
    id: 'pinterest', name: 'Pinterest',
    profile: (u) => `https://www.pinterest.com/${u}/`,
    signup: 'https://www.pinterest.com/',
    rule: (u) => (/^[A-Za-z0-9_]{3,30}$/.test(u) ? null : 'Pinterest names are 3-30 chars: letters, numbers, underscores'),
    check: async (u) => {
      const r = await fetchPage(`https://www.pinterest.com/${encodeURIComponent(u)}/`);
      if (r.status === 404) return avail();
      const title = ogTitle(r.text);
      if (title && title.toLowerCase().includes(u.toLowerCase())) return taken();
      if (/couldn't find|page not found|doesn't exist/i.test(r.text)) return avail();
      return unknown('Pinterest did not give a clear answer');
    },
  },
  {
    id: 'reddit', name: 'Reddit',
    profile: (u) => `https://www.reddit.com/user/${u}`,
    signup: 'https://www.reddit.com/register',
    rule: (u) => (/^[A-Za-z0-9_-]{3,20}$/.test(u) ? null : 'Reddit names are 3-20 chars: letters, numbers, dashes, underscores'),
    check: async () => unknown('Reddit blocks automated lookups'),
  },
];

async function checkAll(u) {
  return Promise.all(PLATFORMS.map(async (p) => {
    const base = { platform: p.name, profileUrl: p.profile(u), signupUrl: p.signup };
    const ruleError = p.rule(u);
    if (ruleError) return { ...base, status: 'invalid', note: ruleError };
    try {
      const res = await p.check(u);
      return { ...base, ...res };
    } catch (e) {
      return { ...base, status: 'unknown', note: 'Check failed or timed out' };
    }
  }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/check') {
    const raw = (url.searchParams.get('u') || '').trim().replace(/^@+/, '');
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(raw)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Enter a username using letters, numbers, dots, dashes or underscores.' }));
    }
    const results = await checkAll(raw);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ handle: raw, results }));
  }

  // Static files: just the one page.
  const file = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const filePath = path.join(__dirname, 'public', file);
  if (!filePath.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  const type = file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => console.log(`Username checker running on port ${PORT}`));
