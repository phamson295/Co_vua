// Lõi giải đố chiếu hết, dùng chung cho công cụ sinh bài, trình duyệt và máy chủ.
import { applyMove, legalMoves, isInCheck } from './engine.js';

export const PUZZLE_TYPES = {
  mate1: { label: 'Chiếu hết trong 1 nước', plies: 1 },
  mate2: { label: 'Chiếu hết trong 2 nước', plies: 3 },
};

export function isCheckmate(state) {
  return isInCheck(state.board, state.turn) && legalMoves(state).length === 0;
}

// Các nước chiếu hết ngay (lọc nhanh bằng "có chiếu không" trước khi đếm nước đi của đối phương).
export function mateMoves(state) {
  return legalMoves(state).filter((m) => {
    const next = applyMove(state, m);
    return isInCheck(next.board, next.turn) && legalMoves(next).length === 0;
  });
}

// Nước `m` có buộc chiếu hết ở nước tiếp theo, dù đối phương chống đỡ thế nào?
export function forcesMateIn2(state, m) {
  const next = applyMove(state, m);
  const replies = legalMoves(next);
  if (replies.length === 0) return false; // đã chiếu hết luôn hoặc hết nước đi
  return replies.every((r) => mateMoves(applyMove(next, r)).length > 0);
}

// Elo cho giải đố: đúng = thắng, sai = thua trước một "đối thủ" có rating là độ khó của bài.
export const DEFAULT_PUZZLE_RATING = { rating: 1000, games: 0, streak: 0, best: 0, solved: 0 };

export function updatePuzzleRating(state, puzzleRating, solved) {
  const k = state.games < 20 ? 40 : 24;
  const expected = 1 / (1 + 10 ** ((puzzleRating - state.rating) / 400));
  const rating = Math.max(100, state.rating + k * ((solved ? 1 : 0) - expected));
  const streak = solved ? state.streak + 1 : 0;
  return {
    rating,
    games: state.games + 1,
    streak,
    best: Math.max(state.best ?? 0, streak),
    solved: (state.solved ?? 0) + (solved ? 1 : 0),
  };
}

// Chọn bài vừa sức: khó dưới rating người giải khoảng 150 điểm (tỷ lệ giải đúng ~70%), tránh bài vừa gặp.
export function pickPuzzle(puzzles, rating, recent = [], random = Math.random) {
  const target = rating - 150;
  const avoid = new Set(recent);
  const pool = puzzles.filter((p) => !avoid.has(p.id));
  const candidates = (pool.length ? pool : puzzles)
    .map((p) => ({ p, d: Math.abs(p.rating - target) + random() * 150 }))
    .sort((a, b) => a.d - b.d);
  return candidates[0].p;
}
