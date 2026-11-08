# Copilot instructions: Game Scroll

Read [AGENTS.md](../AGENTS.md) at the repo root: it is the full guide for AI tools. The short version:

- Each game is one file in `src/games/<id>.js`, with `export default { id, title, tag, retro, w, h, goal, hint, creator, make }`.
- The only import is `import gs from '../gamescroll.js'`; take what you need with `const { sfx } = gs.sound, { haptic } = gs.device;`.
- No `fetch`, storage, `eval`, `import()`, other imports, image or sound files. Save with `api.save()`.
- `make(api)` returns `{ reset, update(dt), draw(c), down, move, up, key? }`. All round state goes in `reset()`.
- Use `gs.effects.Feel` for game feel, `gs.physics` (Rapier) for physics, `gs.ai` for enemies, `gs.pixel` for pixel art.
- Lazy parts (`gs.physics`, `gs.physics3d`, `gs.fx3d`, `gs.vision`, `gs.sound.Tone`) must be created in `make()` or `reset()`.
- Original games only: no recreations of existing games, even renamed.
- Check with `node scripts/game-lint.mjs <id>`, `npm run games`, `npm run build:bundled && node scripts/smoke.cjs <id>`.
