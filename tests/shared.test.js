import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Clock, formatClock, poolOf, findTimeControl, hasMatingMaterial } from '../public/js/shared.js';
import { fromFen } from '../public/js/engine.js';
import {
  glicko2,
  rateGame,
  inflateRd,
  botElo,
  updateBotRating,
  suggestedBotLevel,
  levelFromXp,
  xpNeed,
  onlineXp,
  botXp,
  DEFAULT_RATING,
} from '../public/js/rating.js';

test('đồng hồ: chưa chạy trước nước đầu, trừ thời gian, cộng giây thưởng', () => {
  const clock = new Clock(60000, 2000);
  assert.equal(clock.remaining('w', 5000), 60000, 'Trắng nghĩ nước đầu không mất giờ');
  clock.press('w', 5000); // Trắng đi nước đầu, đồng hồ Đen chạy
  assert.equal(clock.running, 'b');
  assert.equal(clock.remaining('b', 15000), 50000);
  clock.press('b', 15000); // Đen dùng 10 giây, được cộng 2 giây
  assert.equal(clock.time.b, 52000);
  assert.equal(clock.remaining('w', 18000), 57000);
  clock.stop(18000);
  assert.equal(clock.time.w, 57000);
  assert.equal(clock.running, null);
});

test('hiển thị đồng hồ', () => {
  assert.equal(formatClock(300000), '5:00');
  assert.equal(formatClock(61000), '1:01');
  assert.equal(formatClock(9450), '0:09.4');
  assert.equal(formatClock(-5), '0:00.0');
  assert.equal(formatClock(3600000), '1:00:00');
});

test('nhóm xếp hạng theo thể thức thời gian', () => {
  assert.equal(poolOf(findTimeControl('1+0')), 'bullet');
  assert.equal(poolOf(findTimeControl('3+2')), 'blitz');
  assert.equal(poolOf(findTimeControl('5+0')), 'blitz');
  assert.equal(poolOf(findTimeControl('10+0')), 'rapid');
  assert.equal(poolOf(findTimeControl('none')), 'rapid');
  assert.equal(findTimeControl('khong-co').id, 'none');
});

test('đủ quân để chiếu hết khi đối phương hết giờ', () => {
  assert.equal(hasMatingMaterial(fromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1').board, 'w'), false);
  assert.equal(hasMatingMaterial(fromFen('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').board, 'w'), false);
  assert.equal(hasMatingMaterial(fromFen('4k3/8/8/8/8/8/8/2BNK3 w - - 0 1').board, 'w'), true);
  assert.equal(hasMatingMaterial(fromFen('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1').board, 'w'), true);
});

test('Glicko-2 khớp ví dụ của Glickman', () => {
  const r = glicko2(1500, 200, 0.06, [[1400, 30, 1], [1550, 100, 0], [1700, 300, 0]], 0.5);
  assert.ok(Math.abs(r.rating - 1464.06) < 0.05, String(r.rating));
  assert.ok(Math.abs(r.rd - 151.52) < 0.05, String(r.rd));
  assert.ok(Math.abs(r.sigma - 0.05999) < 0.0001, String(r.sigma));
});

test('một ván xếp hạng: người thắng tăng, người thua giảm, người mới thay đổi nhiều hơn', () => {
  const veteran = { rating: 1500, rd: 50, vol: 0.06, games: 200, lastPlayed: Date.now() };
  const [newbie, vet] = rateGame({ ...DEFAULT_RATING }, veteran, 1);
  assert.ok(newbie.rating > 1650, `người mới tăng mạnh: ${newbie.rating}`);
  assert.ok(vet.rating < 1500 && vet.rating > 1490, `người cũ giảm ít: ${vet.rating}`);
  assert.equal(newbie.games, 1);
  assert.ok(newbie.rd < 350);
  const [draw] = rateGame(veteran, veteran, 0.5);
  assert.ok(Math.abs(draw.rating - 1500) < 0.01, 'hòa giữa hai người ngang nhau không đổi rating');
});

test('nghỉ chơi làm RD tăng nhưng không vượt 350', () => {
  assert.ok(inflateRd(50, 0.06, 30) > 50);
  assert.equal(inflateRd(300, 0.06, 100000), 350);
  assert.equal(inflateRd(80, 0.06, 0), 80);
});

test('Elo luyện tập với Bot và cấp gợi ý', () => {
  assert.equal(botElo(1), 600);
  assert.equal(botElo(12), 600 + 125 * 11);
  const after = updateBotRating({ rating: 1000, games: 0 }, 4, 1);
  assert.ok(after.rating > 1000 && after.games === 1);
  const lose = updateBotRating({ rating: 1000, games: 50 }, 1, 0);
  assert.ok(lose.rating < 1000);
  assert.equal(suggestedBotLevel(600), 1);
  assert.equal(suggestedBotLevel(1000), 5);
  assert.equal(suggestedBotLevel(5000), 12);
});

test('EXP: đường cong cấp độ và điểm thưởng', () => {
  assert.equal(xpNeed(1), 100);
  assert.deepEqual(levelFromXp(0), { level: 1, into: 0, need: 100 });
  assert.equal(levelFromXp(3780).level, 10);
  assert.equal(levelFromXp(3779).level, 9);
  assert.equal(levelFromXp(10 ** 9).level, 50);
  assert.equal(onlineXp('win', 40), 40);
  assert.equal(onlineXp('draw', 40), 30);
  assert.equal(onlineXp('loss', 40), 20);
  assert.equal(onlineXp('win', 5), 0, 'ván quá ngắn không có EXP');
  assert.ok(botXp(12, 'win', 40) > botXp(1, 'win', 40), 'thắng Bot mạnh được nhiều EXP hơn');
  assert.equal(botXp(12, 'win', 40), 30);
});
