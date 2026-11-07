// play.game-scroll.com/<game id>: the page a shared link opens.
// On a phone with Game Scroll installed, "Open in Game Scroll" jumps straight to that game
// (gamescroll://game/<id>). The page also has link-preview tags so chats show the game's name.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Build the page. game: the catalogue entry ({ id, title, hint, tag }) or null when unknown.
 * webUrl: where to play in a browser (the test site for now), or '' to leave that button out.
 */
export function sharePage(game, { webUrl = '' } = {}) {
  const title = game ? `${game.title} · Game Scroll` : 'Game Scroll';
  const desc = game ? `${game.hint || ''}`.slice(0, 200) : 'Scroll a feed of quick mini games.';
  const appUrl = game ? `gamescroll://game/${game.id}` : 'gamescroll://';
  const web = webUrl ? (game ? `${webUrl}?g=${encodeURIComponent(game.id)}` : webUrl) : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(game ? game.title : 'Game Scroll')}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:site_name" content="Game Scroll">
<meta name="twitter:card" content="summary">
<meta name="robots" content="noindex">
<style>
  :root { --bg:#0c0e12; --card:#171a21; --text:#f2f3f5; --muted:#9aa1ad; --accent:#ff4d6d; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--text);
         font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding:16px; }
  main { width:100%; max-width:420px; background:var(--card); border-radius:20px; padding:28px 24px; text-align:center; }
  .brand { font-weight:800; letter-spacing:.08em; font-size:13px; color:var(--muted); text-transform:uppercase; }
  .tag { display:inline-block; margin-top:18px; font-size:12px; color:var(--muted); }
  h1 { margin:6px 0 8px; font-size:28px; line-height:1.15; }
  p { margin:0 0 22px; color:var(--muted); }
  a.btn { display:block; padding:14px 16px; border-radius:14px; text-decoration:none; font-weight:700; margin-top:10px; }
  a.primary { background:var(--accent); color:#fff; }
  a.secondary { background:#252a35; color:var(--text); }
  small { display:block; margin-top:18px; color:var(--muted); font-size:13px; }
</style></head>
<body><main>
  <div class="brand">Game Scroll</div>
  ${game ? `<span class="tag">${esc(game.tag || '')}</span><h1>${esc(game.title)}</h1><p>${esc(desc)}</p>`
         : `<h1>Game Scroll</h1><p>${esc(desc)}</p>`}
  <a class="btn primary" href="${esc(appUrl)}">Open in Game Scroll</a>
  ${web ? `<a class="btn secondary" href="${esc(web)}">Play in your browser</a>` : ''}
  <small>${game ? 'Someone shared this game with you.' : 'That game link didn’t work, but the rest of the feed is waiting.'}</small>
</main></body></html>`;
}

/** The game id from a share URL path like /mini-golf, or null. */
export function idFromPath(pathname) {
  const id = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, '')).toLowerCase();
  return GAME_RE.test(id) ? id : null;
}
