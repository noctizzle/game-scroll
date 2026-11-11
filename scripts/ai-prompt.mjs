// Prints one prompt to paste into a chat AI (ChatGPT, Gemini, Claude.ai...) to make a game:
//   npm run ai-prompt [style] > prompt.txt      (style: phone, pocket, color, advance, console, nextgen, ar, board)
// It joins docs/ai/game-prompt.md, AGENTS.md (the rules and the gs kit) and a starter template.
import { readFileSync } from 'node:fs';
const style = process.argv[2] || 'phone';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
process.stdout.write([
  read('docs/ai/game-prompt.md'),
  '---\n\n' + read('AGENTS.md'),
  `---\n\n## Starter template (${style})\n\n\`\`\`js\n` + read(`scripts/templates/${style}.js`) + '\n```\n',
].join('\n'));
