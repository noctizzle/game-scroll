// Thinks about a chess move off the main thread (see chess-ai.js), so the board keeps drawing.
import { Chess } from 'chess.js';
import { bestMove } from './chess-ai.js';

self.onmessage = e => {
  const { job, fen, level, time } = e.data;
  try { self.postMessage({ job, move: bestMove(new Chess(fen), { level, time }) }); }
  catch (err) { self.postMessage({ job, error: String(err && err.message || err) }); }
};
