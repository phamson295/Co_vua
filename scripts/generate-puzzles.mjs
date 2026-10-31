// Sinh kho bài giải đố chiếu hết bằng chính engine của dự án.
// Cách làm: cho máy tự đấu ở các cấp độ khác nhau, ở mỗi thế cờ tìm các tình huống
// - chiếu hết trong 1 nước có DUY NHẤT một nước chiếu hết;
// - chiếu hết trong 2 nước có DUY NHẤT một nước đầu buộc chiếu hết và không có chiếu hết 1 nước.
// Chạy: node scripts/generate-puzzles.mjs [số phút] > public/data/puzzles.json
import { Game, applyMove, legalMoves, isInCheck, toFen, toUci } from '../public/js/engine.js';
import { chooseMove, LEVELS } from '../public/js/ai.js';
import { mateMoves, forcesMateIn2 } from '../public/js/puzzle-core.js';

const minutes = Number(process.argv[2] ?? 6);
const deadline = Date.now() + minutes * 60 * 1000;
const WANT = { mate1: 140, mate2: 90 };
const found = { mate1: [], mate2: [] };
const seen = new Set();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Độ khó ước lượng: nhiều lựa chọn, nước giải "lặng" (không ăn quân), không dùng Hậu thì khó hơn.
function rateMate1(state, m) {
  const quiet = !m.captured;
  return clamp(650 + legalMoves(state).length * 7 + (quiet ? 150 : 0) + (m.piece[1] !== 'Q' ? 120 : 0), 600, 1500);
}

function rateMate2(state, key) {
  const next = applyMove(state, key);
  const quietKey = !key.captured;
  const checkingKey = isInCheck(next.board, next.turn);
  return clamp(1200 + legalMoves(state).length * 6 + (quietKey ? 150 : 0) + (checkingKey ? 0 : 250) + (key.piece[1] !== 'Q' ? 80 : 0), 1150, 2100);
}

function consider(state) {
  const key = state.board.join('') + state.turn;
  if (seen.has(key)) return;
  seen.add(key);

  const mates = mateMoves(state);
  if (mates.length === 1 && found.mate1.length < WANT.mate1) {
    const m = mates[0];
    found.mate1.push({ type: 'mate1', fen: toFen(state), line: [toUci(m)], rating: rateMate1(state, m) });
    return;
  }
  if (mates.length > 0 || found.mate2.length >= WANT.mate2) return;

  // Chiếu hết 2 nước: thử mọi nước đầu, dừng sớm nếu có hơn một nước buộc chiếu hết.
  const keys = [];
  for (const m of legalMoves(state)) {
    if (forcesMateIn2(state, m)) {
      keys.push(m);
      if (keys.length > 1) return;
    }
  }
  if (keys.length !== 1) return;
  const key1 = keys[0];
  const next = applyMove(state, key1);
  // Nước chống đỡ "tốt nhất": nước làm bên tấn công có ít cách chiếu hết nhất.
  let defense = null;
  let fewest = Infinity;
  for (const r of legalMoves(next)) {
    const count = mateMoves(applyMove(next, r)).length;
    if (count < fewest) {
      fewest = count;
      defense = r;
    }
  }
  const finalMate = mateMoves(applyMove(next, defense))[0];
  found.mate2.push({
    type: 'mate2',
    fen: toFen(state),
    line: [toUci(key1), toUci(defense), toUci(finalMate)],
    rating: rateMate2(state, key1),
  });
}

let games = 0;
while (Date.now() < deadline && (found.mate1.length < WANT.mate1 || found.mate2.length < WANT.mate2)) {
  games++;
  const g = new Game();
  const levels = { w: 2 + Math.floor(Math.random() * 8), b: 2 + Math.floor(Math.random() * 8) };
  for (let ply = 0; ply < 4; ply++) {
    const moves = g.legalMoves();
    const m = moves[Math.floor(Math.random() * moves.length)];
    g.play(m.from, m.to, m.promo);
  }
  while (!g.status().over && g.moves.length < 140 && Date.now() < deadline) {
    if (g.moves.length >= 16) consider(g.state);
    const level = { ...LEVELS[levels[g.turn] - 1], timeMs: 300 };
    const { move } = chooseMove(g.state, level);
    g.play(move.from, move.to, move.promo);
  }
  process.stderr.write(`ván ${games}: ${found.mate1.length} bài chiếu hết 1 nước, ${found.mate2.length} bài 2 nước\n`);
}

const all = [...found.mate1, ...found.mate2]
  .sort((a, b) => a.rating - b.rating)
  .map((p, i) => ({ id: `p${String(i + 1).padStart(3, '0')}`, ...p }));
process.stdout.write(JSON.stringify(all));
