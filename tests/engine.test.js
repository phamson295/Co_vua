import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFen, perft, Game, sqIndex } from '../public/js/engine.js';

// Số thế cờ chuẩn (perft) của các vị trí kiểm thử phổ biến trên chessprogramming wiki.
test('perft vị trí xuất phát', () => {
  const s = fromFen();
  assert.equal(perft(s, 1), 20);
  assert.equal(perft(s, 2), 400);
  assert.equal(perft(s, 3), 8902);
});

test('perft "Kiwipete": nhập thành, bắt tốt qua đường, phong cấp', () => {
  const s = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(s, 1), 48);
  assert.equal(perft(s, 2), 2039);
  assert.equal(perft(s, 3), 97862);
});

test('perft vị trí 3: bắt tốt qua đường và chiếu', () => {
  const s = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(s, 1), 14);
  assert.equal(perft(s, 2), 191);
  assert.equal(perft(s, 3), 2812);
});

test('perft vị trí 4: phong cấp và nhập thành (bản lật màu)', () => {
  const s = fromFen('r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1');
  assert.equal(perft(s, 1), 6);
  assert.equal(perft(s, 2), 264);
  assert.equal(perft(s, 3), 9467);
});

test('perft vị trí 4 gốc: quân Trắng đi với nhiều nước phong cấp', () => {
  const s = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/1RN2Q2/Pp1P2PP/R2K3R w kq - 0 1');
  assert.equal(perft(s, 1), 44);
  assert.equal(perft(s, 2), 1634);
  assert.equal(perft(s, 3), 66546);
});

test('perft vị trí 5', () => {
  const s = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  assert.equal(perft(s, 1), 44);
  assert.equal(perft(s, 2), 1486);
  assert.equal(perft(s, 3), 62379);
});

test('nhận diện chiếu hết (chiếu hết kiểu Fool\'s mate)', () => {
  const g = new Game();
  g.play(sqIndex('f2'), sqIndex('f3'));
  g.play(sqIndex('e7'), sqIndex('e5'));
  g.play(sqIndex('g2'), sqIndex('g4'));
  g.play(sqIndex('d8'), sqIndex('h4'));
  assert.deepEqual(
    { over: g.status().over, reason: g.status().reason, winner: g.status().winner },
    { over: true, reason: 'checkmate', winner: 'b' },
  );
});

test('nhận diện hết nước đi (pat) là hòa', () => {
  const g = new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(g.status().reason, 'stalemate');
  assert.equal(g.status().winner, null);
});

test('hòa do không đủ quân', () => {
  const g = new Game('8/8/8/4k3/8/8/8/4K3 w - - 0 1');
  assert.equal(g.status().reason, 'insufficient');
});

test('hòa do lặp lại thế cờ 3 lần', () => {
  const g = new Game();
  const cycle = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
  for (let round = 0; round < 2; round++) {
    for (const [from, to] of cycle) g.play(sqIndex(from), sqIndex(to));
  }
  assert.equal(g.status().reason, 'repetition');
});

test('ký hiệu SAN: nước thường, chiếu hết, nhập thành', () => {
  const g = new Game();
  for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
    g.play(sqIndex(from), sqIndex(to));
  }
  assert.equal(g.pgn(), '1. f3 e5 2. g4 Qh4#');

  const castle = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(castle.play(sqIndex('e1'), sqIndex('g1')).san, 'O-O');
  assert.equal(castle.play(sqIndex('e8'), sqIndex('c8')).san, 'O-O-O');
});

test('ký hiệu SAN: phân biệt hai xe, bắt quân, phong cấp có chiếu', () => {
  const rooks = new Game('4k3/8/8/8/8/8/K7/R6R w - - 0 1');
  assert.equal(rooks.play(sqIndex('a1'), sqIndex('d1')).san, 'Rad1');
  const rooks2 = new Game('4k3/8/8/8/8/8/K7/R6R w - - 0 1');
  assert.equal(rooks2.play(sqIndex('h1'), sqIndex('d1')).san, 'Rhd1');

  const pawn = new Game('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1');
  assert.equal(pawn.play(sqIndex('e4'), sqIndex('d5')).san, 'exd5');

  const promo = new Game('7k/4P3/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(promo.play(sqIndex('e7'), sqIndex('e8'), 'Q').san, 'e8=Q+');
});

test('hoàn tác nước đi trả lại đúng trạng thái', () => {
  const g = new Game();
  g.play(sqIndex('e2'), sqIndex('e4'));
  g.undo();
  assert.equal(g.turn, 'w');
  assert.equal(g.state.board[sqIndex('e2')], 'wP');
  assert.equal(g.moves.length, 0);
});
