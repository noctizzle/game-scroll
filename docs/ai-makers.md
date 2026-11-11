# Making games with AI tools

You can make a Game Scroll game with Claude, ChatGPT (GPT), Gemini, Copilot or any other AI
helper. The repo carries instructions those tools read, so they know the rules, the `gs` kit and
the checks to run.

## Coding tools that work in the repo

Open the repo in the tool and ask, for example: *"Make a new Pocket game where you herd sheep with
a dog by tilting the phone."*

| Tool | Reads | Extra |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` (which loads `AGENTS.md`) | the `make-game` skill: type `/make-game` or just ask for a game |
| OpenAI Codex, Cursor, Jules, and most others | `AGENTS.md` | |
| Gemini CLI | `GEMINI.md` (which loads `AGENTS.md`) | |
| GitHub Copilot | `.github/copilot-instructions.md` | |

These tools can run the checks themselves (`game-lint`, `game-types`, `npm run games`, the smoke test) and fix
what fails. Ask them to.

## Chat apps (ChatGPT, Gemini, Claude.ai)

1. Run `npm run ai-prompt pocket > prompt.txt` (or `phone`, `color`, `advance`, `console`, `nextgen`, `ar`).
   It joins the request (`docs/ai/game-prompt.md`), the rules and kit (`AGENTS.md`) and a starter template.
2. Open `prompt.txt`, describe your idea where it says so, and paste the whole thing into the chat.
3. Save the code it gives you as `src/games/<id>.js` and run the checks:
   ```bash
   node scripts/game-lint.mjs <id>
   node scripts/game-types.mjs <id>
   node scripts/unique.mjs <id>
   npm run games
   npm run build:bundled && node scripts/smoke.cjs <id>
   ```
4. Paste any errors back into the chat and ask it to fix them. Then play it with `npm run dev`.

## Tips

- Ask for a mechanic that plays differently from the games already in the feed. A reskin won't be merged.
- Ask for original names and characters. AI tools sometimes copy famous games: check, and ask again if so.
- Ask it to use `gs.effects.Feel` for game feel and `gs.physics`, `gs.ai`, `gs.pixel` instead of
  writing its own versions. Games come out shorter and feel better.
- Play it on a real phone before opening the PR: thumbs are bigger than mouse pointers.
- You're responsible for what you submit. Read the code, and keep the rules in [CONTRIBUTING.md](../CONTRIBUTING.md).
