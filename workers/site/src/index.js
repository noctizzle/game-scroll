// game-scroll.com website: serves the static files built into dist-site/ (see wrangler.toml), and
// redirects www.game-scroll.com to the bare domain.
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(req);
  },
};
