// Prints every achievement and leaderboard to create in App Store Connect and Play Console.
// Usage: npm run game-services            (table)
//        npm run game-services -- --csv   (CSV, for a spreadsheet)
import { TROPHIES, BOARDS, gameBoardId } from '../src/kit/trophies.js';
import { iosAchievement, iosBoard, ANDROID } from '../src/kit/platform-ids.js';
import { readdirSync, readFileSync } from 'node:fs';

// Games with `board: true` get their own best-score leaderboard.
const dir = new URL('../src/games/', import.meta.url);
const gameBoards = readdirSync(dir).filter(f => f.endsWith('.js')).map(f => readFileSync(new URL(f, dir), 'utf8'))
  .filter(src => /\bboard:\s*true\b/.test(src))
  .map(src => ({ id: gameBoardId(src.match(/\bid:\s*'([^']+)'/)[1]), name: src.match(/\btitle:\s*'([^']+)'/)[1] + ' Best' }));

const rows = [
  ...TROPHIES.map(t => ({ kind: 'achievement', id: t.id, name: t.name, desc: t.desc, points: t.points, ios: iosAchievement(t.id), android: ANDROID.achievements[t.id] || '' })),
  ...[...BOARDS, ...gameBoards].map(b => ({ kind: 'leaderboard', id: b.id, name: b.name, desc: 'Higher is better, integer', points: '', ios: iosBoard(b.id), android: ANDROID.leaderboards[b.id] || '' })),
];

if (process.argv.includes('--csv')) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  console.log('kind,id,name,description,points,ios_id,android_id');
  for (const r of rows) console.log([r.kind, r.id, r.name, r.desc, r.points, r.ios, r.android].map(q).join(','));
} else {
  console.table(rows.map(r => ({ kind: r.kind, name: r.name, points: r.points, 'iOS id': r.ios, 'Android id': r.android || '(paste from Play Console)' })));
  const pts = TROPHIES.reduce((a, t) => a + t.points, 0);
  console.log(`${TROPHIES.length} achievements (${pts}/1000 Game Center points), ${BOARDS.length + gameBoards.length} leaderboards.`);
}
