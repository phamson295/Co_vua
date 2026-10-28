// Máy chơi cờ: tìm kiếm alpha-beta + quiescence, 12 cấp độ.
import { applyMove, isInCheck, legalMoves, WHITE } from './engine.js';

const MATE = 100000;
const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

// Bảng vị trí (góc nhìn quân Trắng, hàng đầu là hàng 8). Quân Đen dùng i ^ 56 để lật bảng.
const PST = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  R: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  K: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

// Cấp độ 1–12. depth: độ sâu tối đa; timeMs: thời gian tối đa mỗi nước;
// noise: biên độ ngẫu nhiên (centipawn) cộng vào điểm mỗi nước, càng lớn càng dễ đi sai.
export const LEVELS = [
  { level: 1, name: 'Mới tập', depth: 1, timeMs: 1000, noise: 400 },
  { level: 2, name: 'Nhập môn', depth: 1, timeMs: 1000, noise: 250 },
  { level: 3, name: 'Sơ cấp 1', depth: 2, timeMs: 1000, noise: 300 },
  { level: 4, name: 'Sơ cấp 2', depth: 2, timeMs: 1000, noise: 200 },
  { level: 5, name: 'Sơ cấp 3', depth: 2, timeMs: 1500, noise: 120 },
  { level: 6, name: 'Trung cấp 1', depth: 2, timeMs: 1500, noise: 60 },
  { level: 7, name: 'Trung cấp 2', depth: 3, timeMs: 2000, noise: 80 },
  { level: 8, name: 'Trung cấp 3', depth: 3, timeMs: 2000, noise: 40 },
  { level: 9, name: 'Khá', depth: 3, timeMs: 2500, noise: 15 },
  { level: 10, name: 'Giỏi', depth: 4, timeMs: 3000, noise: 0 },
  { level: 11, name: 'Rất giỏi', depth: 5, timeMs: 4000, noise: 0 },
  { level: 12, name: 'Chuyên gia', depth: 6, timeMs: 6000, noise: 0 },
];

const TIMEOUT = Symbol('timeout');
let nodes = 0;
let deadline = 0;

// Điểm theo góc nhìn bên đang đi (số dương = bên đi đang có lợi).
function evaluate(state) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const type = p[1];
    const v = VALUE[type] + PST[type][p[0] === WHITE ? i : i ^ 56];
    score += p[0] === WHITE ? v : -v;
  }
  return state.turn === WHITE ? score : -score;
}

function tick() {
  if ((++nodes & 1023) === 0 && Date.now() > deadline) throw TIMEOUT;
}

// Ưu tiên nước ăn quân giá trị cao bằng quân giá trị thấp, rồi đến phong cấp.
function priority(m) {
  let s = 0;
  if (m.captured) s += 10 * VALUE[m.captured[1]] - VALUE[m.piece[1]];
  if (m.promo) s += VALUE[m.promo];
  return s;
}

const orderMoves = (moves) => moves.sort((a, b) => priority(b) - priority(a));

function quiesce(state, alpha, beta) {
  tick();
  const stand = evaluate(state);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of orderMoves(legalMoves(state).filter((x) => x.captured))) {
    const score = -quiesce(applyMove(state, m), -beta, -alpha);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, ply) {
  if (depth <= 0) return quiesce(state, alpha, beta);
  tick();
  const moves = orderMoves(legalMoves(state));
  if (moves.length === 0) return isInCheck(state.board, state.turn) ? -(MATE - ply) : 0;
  let best = -Infinity;
  for (const m of moves) {
    const score = -negamax(applyMove(state, m), depth - 1, -beta, -alpha, ply + 1);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Chọn nước đi. Dùng lặp sâu dần: nếu hết giờ thì lấy kết quả của độ sâu đã hoàn thành.
export function chooseMove(state, { depth = 2, timeMs = 1000, noise = 0, random = Math.random } = {}) {
  const moves = orderMoves(legalMoves(state));
  if (moves.length <= 1) return { move: moves[0] ?? null, score: 0, depth: 0 };

  nodes = 0;
  deadline = Date.now() + timeMs;
  let scored = moves.map((m) => ({ m, score: 0 }));
  let completed = 0;

  for (let d = 1; d <= depth; d++) {
    const iteration = [];
    let alpha = -Infinity;
    try {
      for (const { m } of scored) {
        // Khi có nhiễu, cần điểm chính xác của mọi nước, nên không cắt cửa sổ ở gốc.
        const floor = noise > 0 ? -Infinity : alpha;
        const score = -negamax(applyMove(state, m), d - 1, -Infinity, -floor, 1);
        iteration.push({ m, score });
        if (score > alpha) alpha = score;
      }
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      break;
    }
    iteration.sort((a, b) => b.score - a.score);
    scored = iteration;
    completed = d;
    if (Date.now() > deadline) break;
  }

  let best = scored[0];
  if (noise > 0) {
    let bestValue = -Infinity;
    for (const x of scored) {
      const value = x.score + (random() * 2 - 1) * noise;
      if (value > bestValue) {
        bestValue = value;
        best = x;
      }
    }
  }
  return { move: best.m, score: best.score, depth: completed };
}
