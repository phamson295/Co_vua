// Luật cờ vua: sinh nước đi hợp lệ, kiểm tra chiếu, chiếu hết, hòa.
// Module này dùng chung cho trình duyệt, máy AI (Web Worker) và máy chủ online.

export const WHITE = 'w';
export const BLACK = 'b';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const FILES = 'abcdefgh';
const PROMOTIONS = ['Q', 'R', 'B', 'N'];
const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_STEPS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const QUEEN_STEPS = [...ROOK_STEPS, ...BISHOP_STEPS];
// Khi xe/vua xuất phát hoặc bị ăn tại các ô này thì mất quyền nhập thành tương ứng.
const CASTLE_LOST = { 0: 'q', 4: 'kq', 7: 'k', 56: 'Q', 60: 'KQ', 63: 'K' };

// Ô được đánh số 0 (a8) đến 63 (h1), hàng 0 là hàng 8.
export const sqIndex = (name) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
export const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));
export const opponent = (color) => (color === WHITE ? BLACK : WHITE);

const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const pieceAt = (board, r, c) => (inside(r, c) ? board[r * 8 + c] : null);

// Đọc FEN thành trạng thái: { board, turn, castling, ep, half, full }
export function fromFen(fen = START_FEN) {
  const [placement, turn, castling, ep, half, full] = fen.split(' ');
  const board = new Array(64).fill(null);
  let i = 0;
  for (const ch of placement) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') {
      i += Number(ch);
    } else {
      board[i++] = (ch === ch.toUpperCase() ? WHITE : BLACK) + ch.toUpperCase();
    }
  }
  return {
    board,
    turn,
    castling: castling === '-' ? '' : castling,
    ep: ep === '-' ? -1 : sqIndex(ep),
    half: Number(half ?? 0),
    full: Number(full ?? 1),
  };
}

// Ô `sq` có bị quân màu `by` tấn công không?
export function isAttacked(board, sq, by) {
  const r = sq >> 3;
  const c = sq & 7;
  // Tốt trắng đi lên (hàng giảm), nên tấn công ô phía trên nó.
  const pawnRow = by === WHITE ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    if (pieceAt(board, pawnRow, c + dc) === by + 'P') return true;
  }
  for (const [dr, dc] of KNIGHT_STEPS) {
    if (pieceAt(board, r + dr, c + dc) === by + 'N') return true;
  }
  for (const [dr, dc] of KING_STEPS) {
    if (pieceAt(board, r + dr, c + dc) === by + 'K') return true;
  }
  for (const [steps, slider] of [[ROOK_STEPS, 'R'], [BISHOP_STEPS, 'B']]) {
    for (const [dr, dc] of steps) {
      let nr = r + dr;
      let nc = c + dc;
      while (inside(nr, nc)) {
        const p = board[nr * 8 + nc];
        if (p) {
          if (p === by + slider || p === by + 'Q') return true;
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }
  return false;
}

export function isInCheck(board, color) {
  const king = board.indexOf(color + 'K');
  return king >= 0 && isAttacked(board, king, opponent(color));
}

const canLand = (state, to) => {
  const p = state.board[to];
  return !p || p[0] !== state.turn;
};

function createMove(state, from, to, promo = null) {
  return {
    from,
    to,
    piece: state.board[from],
    captured: state.board[to],
    promo,
    ep: false,
    castle: false,
  };
}

function stepMoves(state, from, steps, moves) {
  const r = from >> 3;
  const c = from & 7;
  for (const [dr, dc] of steps) {
    const nr = r + dr;
    const nc = c + dc;
    if (inside(nr, nc) && canLand(state, nr * 8 + nc)) {
      moves.push(createMove(state, from, nr * 8 + nc));
    }
  }
}

function slideMoves(state, from, steps, moves) {
  const r = from >> 3;
  const c = from & 7;
  for (const [dr, dc] of steps) {
    let nr = r + dr;
    let nc = c + dc;
    while (inside(nr, nc)) {
      const to = nr * 8 + nc;
      if (state.board[to]) {
        if (canLand(state, to)) moves.push(createMove(state, from, to));
        break;
      }
      moves.push(createMove(state, from, to));
      nr += dr;
      nc += dc;
    }
  }
}

function addPawnMove(state, from, to, moves) {
  const lastRank = to < 8 || to >= 56;
  if (!lastRank) {
    moves.push(createMove(state, from, to));
    return;
  }
  for (const promo of PROMOTIONS) moves.push(createMove(state, from, to, promo));
}

function pawnMoves(state, from, moves) {
  const { board, turn, ep } = state;
  const dir = turn === WHITE ? -1 : 1;
  const startRow = turn === WHITE ? 6 : 1;
  const r = from >> 3;
  const c = from & 7;
  const one = from + dir * 8;
  if (inside(r + dir, c) && !board[one]) {
    addPawnMove(state, from, one, moves);
    const two = from + dir * 16;
    if (r === startRow && !board[two]) moves.push(createMove(state, from, two));
  }
  for (const dc of [-1, 1]) {
    if (!inside(r + dir, c + dc)) continue;
    const to = one + dc;
    if (board[to] && canLand(state, to)) {
      addPawnMove(state, from, to, moves);
    } else if (to === ep) {
      const m = createMove(state, from, to);
      m.ep = true;
      m.captured = opponent(turn) + 'P';
      moves.push(m);
    }
  }
}

function castleMoves(state, from, moves) {
  const { board, turn, castling } = state;
  const enemy = opponent(turn);
  const home = turn === WHITE ? 60 : 4;
  if (from !== home || isAttacked(board, home, enemy)) return;
  const [kingSide, queenSide] = turn === WHITE ? ['K', 'Q'] : ['k', 'q'];
  const rook = turn + 'R';

  if (
    castling.includes(kingSide) &&
    !board[home + 1] && !board[home + 2] && board[home + 3] === rook &&
    !isAttacked(board, home + 1, enemy) && !isAttacked(board, home + 2, enemy)
  ) {
    const m = createMove(state, from, home + 2);
    m.castle = true;
    moves.push(m);
  }
  if (
    castling.includes(queenSide) &&
    !board[home - 1] && !board[home - 2] && !board[home - 3] && board[home - 4] === rook &&
    !isAttacked(board, home - 1, enemy) && !isAttacked(board, home - 2, enemy)
  ) {
    const m = createMove(state, from, home - 2);
    m.castle = true;
    moves.push(m);
  }
}

// Nước đi giả hợp lệ: chưa kiểm tra vua có bị chiếu sau khi đi hay không.
function pseudoMoves(state) {
  const moves = [];
  for (let from = 0; from < 64; from++) {
    const piece = state.board[from];
    if (!piece || piece[0] !== state.turn) continue;
    switch (piece[1]) {
      case 'P': pawnMoves(state, from, moves); break;
      case 'N': stepMoves(state, from, KNIGHT_STEPS, moves); break;
      case 'B': slideMoves(state, from, BISHOP_STEPS, moves); break;
      case 'R': slideMoves(state, from, ROOK_STEPS, moves); break;
      case 'Q': slideMoves(state, from, QUEEN_STEPS, moves); break;
      case 'K':
        stepMoves(state, from, KING_STEPS, moves);
        castleMoves(state, from, moves);
        break;
    }
  }
  return moves;
}

// Trả về trạng thái mới sau khi đi nước `m` (không đổi `state`).
export function applyMove(state, m) {
  const { board, turn, castling } = state;
  const next = board.slice();
  const type = m.piece[1];

  next[m.from] = null;
  next[m.to] = m.promo ? turn + m.promo : m.piece;
  if (m.ep) next[(m.from & ~7) | (m.to & 7)] = null;
  if (m.castle) {
    const rookFrom = m.to > m.from ? m.from + 3 : m.from - 4;
    const rookTo = (m.from + m.to) / 2;
    next[rookTo] = next[rookFrom];
    next[rookFrom] = null;
  }

  let rights = castling;
  for (const sq of [m.from, m.to]) {
    const lost = CASTLE_LOST[sq];
    if (lost) rights = rights.split('').filter((ch) => !lost.includes(ch)).join('');
  }

  const captured = m.captured || m.ep;
  return {
    board: next,
    turn: opponent(turn),
    castling: rights,
    ep: type === 'P' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1,
    half: type === 'P' || captured ? 0 : state.half + 1,
    full: turn === BLACK ? state.full + 1 : state.full,
  };
}

export function legalMoves(state) {
  return pseudoMoves(state).filter((m) => !isInCheck(applyMove(state, m).board, state.turn));
}

// Ghi trạng thái ra chuỗi FEN (ngược với fromFen).
export function toFen(s) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = s.board[r * 8 + c];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p[0] === WHITE ? p[1] : p[1].toLowerCase();
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${s.turn} ${s.castling || '-'} ${s.ep >= 0 ? sqName(s.ep) : '-'} ${s.half} ${s.full}`;
}

// Nước đi dạng UCI: "e2e4", "e7e8q"
export const toUci = (m) => sqName(m.from) + sqName(m.to) + (m.promo ? m.promo.toLowerCase() : '');

// Ký hiệu đại số chuẩn (SAN) của nước `m` đi từ thế `state`, ví dụ: e4, Nf3, exd5, O-O, e8=Q+, Qh4#
export function toSan(state, m) {
  const type = m.piece[1];
  const capture = m.captured || m.ep;
  let san;
  if (m.castle) {
    san = m.to > m.from ? 'O-O' : 'O-O-O';
  } else if (type === 'P') {
    san = (capture ? FILES[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo : '');
  } else {
    // Khi có quân cùng loại khác cũng đi được tới ô đích thì thêm cột/hàng/ô xuất phát để phân biệt.
    const rivals = legalMoves(state).filter(
      (x) => x.piece === m.piece && x.to === m.to && x.from !== m.from,
    );
    let from = '';
    if (rivals.length > 0) {
      const sameFile = rivals.some((x) => (x.from & 7) === (m.from & 7));
      const sameRank = rivals.some((x) => x.from >> 3 === m.from >> 3);
      if (!sameFile) from = FILES[m.from & 7];
      else if (!sameRank) from = String(8 - (m.from >> 3));
      else from = sqName(m.from);
    }
    san = type + from + (capture ? 'x' : '') + sqName(m.to);
  }
  const next = applyMove(state, m);
  if (isInCheck(next.board, next.turn)) san += legalMoves(next).length > 0 ? '+' : '#';
  return san;
}

// Khóa định danh thế cờ, dùng để phát hiện lặp lại 3 lần.
export const positionKey = (s) => s.board.map((p) => p || '.').join('') + s.turn + s.castling + s.ep;

function insufficientMaterial(board) {
  const pieces = board.filter((p) => p && p[1] !== 'K');
  if (pieces.length === 0) return true;
  return pieces.length === 1 && (pieces[0][1] === 'N' || pieces[0][1] === 'B');
}

// Ván cờ: giữ lịch sử để hỗ trợ hoàn tác và kiểm tra hòa.
export class Game {
  constructor(fen = START_FEN) {
    this.states = [fromFen(fen)];
    this.keys = [positionKey(this.states[0])];
    this.moves = [];
  }

  get state() {
    return this.states[this.states.length - 1];
  }

  get turn() {
    return this.state.turn;
  }

  legalMoves() {
    return legalMoves(this.state);
  }

  movesFrom(from) {
    return this.legalMoves().filter((m) => m.from === from);
  }

  // Thực hiện nước đi nếu hợp lệ. Trả về nước đi đã đi, hoặc null nếu không hợp lệ.
  play(from, to, promo = null) {
    const m = this.legalMoves().find(
      (x) => x.from === from && x.to === to && x.promo === (promo || null),
    );
    if (!m) return null;
    m.san = toSan(this.state, m);
    this.states.push(applyMove(this.state, m));
    this.keys.push(positionKey(this.state));
    this.moves.push(m);
    return m;
  }

  // Các nước đi dạng PGN: "1. e4 e5 2. Nf3 Nc6"
  pgn() {
    return this.moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${m.san}` : m.san)).join(' ');
  }

  undo() {
    if (this.moves.length === 0) return null;
    this.states.pop();
    this.keys.pop();
    return this.moves.pop();
  }

  // { over, reason, winner, check }. reason: checkmate | stalemate | fifty | repetition | insufficient
  status() {
    const { state } = this;
    const check = isInCheck(state.board, state.turn);
    const result = (reason, winner = null) => ({ over: true, reason, winner, check });

    if (this.legalMoves().length === 0) {
      return check ? result('checkmate', opponent(state.turn)) : result('stalemate');
    }
    if (state.half >= 100) return result('fifty');
    const last = this.keys[this.keys.length - 1];
    if (this.keys.filter((k) => k === last).length >= 3) return result('repetition');
    if (insufficientMaterial(state.board)) return result('insufficient');
    return { over: false, reason: null, winner: null, check };
  }
}

// Đếm số thế cờ sinh ra từ `state` sau `depth` nước: dùng để kiểm thử luật.
export function perft(state, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(state)) nodes += perft(applyMove(state, m), depth - 1);
  return nodes;
}
