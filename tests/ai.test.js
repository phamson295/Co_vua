import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFen, legalMoves, Game, sqIndex } from '../public/js/engine.js';
import { chooseMove, LEVELS } from '../public/js/ai.js';

test('có đủ 12 cấp độ', () => {
  assert.equal(LEVELS.length, 12);
  assert.deepEqual(LEVELS.map((l) => l.level), [...Array(12).keys()].map((i) => i + 1));
});

test('mọi cấp độ đều trả về nước đi hợp lệ từ thế xuất phát', () => {
  const state = fromFen();
  const legal = legalMoves(state);
  for (const level of LEVELS) {
    const { move } = chooseMove(state, { ...level, timeMs: 300 });
    assert.ok(
      legal.some((m) => m.from === move.from && m.to === move.to),
      `cấp ${level.level} trả về nước đi không hợp lệ`,
    );
  }
});

test('cấp cao nhất tìm được chiếu hết trong 1 nước (Rh8#)', () => {
  const g = new Game('k7/8/1K6/8/8/8/8/7R w - - 0 1');
  const { move } = chooseMove(g.state, LEVELS[11]);
  assert.equal(move.from, sqIndex('h1'));
  assert.equal(move.to, sqIndex('h8'));
});

test('cấp cao nhất không để mất hậu miễn phí', () => {
  // Hậu đen ở d5 bị tốt trắng e4 tấn công; máy trắng phải không bỏ hậu.
  const state = fromFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
  const { move } = chooseMove(state, LEVELS[11]);
  assert.equal(move.captured, 'bQ');
});

test('thời gian suy nghĩ không vượt quá giới hạn đáng kể', () => {
  const state = fromFen('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  const started = Date.now();
  chooseMove(state, LEVELS[11]);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < LEVELS[11].timeMs + 1000, `mất ${elapsed}ms`);
});
