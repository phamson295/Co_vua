// Các hệ thống điểm (xem docs/he-thong-xep-hang-va-diem-so.md):
// - Glicko-2 cho ván online có xếp hạng (máy chủ tính).
// - Elo một phía cho "Elo luyện tập" với Bot (tính trên máy người chơi).
// - EXP và cấp độ (máy chủ lưu cho người có tài khoản).

const SCALE = 173.7178;
export const DEFAULT_RATING = { rating: 1500, rd: 350, vol: 0.06, games: 0, lastPlayed: null };
export const PROVISIONAL_RD = 110; // RD lớn hơn mức này thì hiển thị kèm dấu "?"
const MIN_RD = 45; // không để RD co lại quá nhỏ, rating vẫn còn phản ứng với phong độ
const MAX_RD = 350;
const DAY = 24 * 3600 * 1000;

export function glicko2(rating, rd, sigma, games, tau = 0.5) {
  const mu = (rating - 1500) / SCALE;
  const phi = rd / SCALE;
  const g = (p) => 1 / Math.sqrt(1 + (3 * p * p) / (Math.PI * Math.PI));
  const E = (m, mj, pj) => 1 / (1 + Math.exp(-g(pj) * (m - mj)));
  const opp = games.map(([r, d, s]) => ({ mj: (r - 1500) / SCALE, pj: d / SCALE, s }));

  let v = 0;
  let delta = 0;
  for (const o of opp) {
    const e = E(mu, o.mj, o.pj);
    v += g(o.pj) ** 2 * e * (1 - e);
    delta += g(o.pj) * (o.s - e);
  }
  v = 1 / v;
  delta *= v;

  const a = Math.log(sigma * sigma);
  const f = (x) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) / (2 * (phi * phi + v + Math.exp(x)) ** 2) -
    (x - a) / (tau * tau);
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > 1e-6) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaNew = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  let muNew = mu;
  for (const o of opp) muNew += phiNew * phiNew * g(o.pj) * (o.s - E(mu, o.mj, o.pj));
  return { rating: SCALE * muNew + 1500, rd: SCALE * phiNew, sigma: sigmaNew };
}

// RD tăng dần khi nghỉ chơi (mỗi ngày là một kỳ), nhưng rating không bị trừ.
export function inflateRd(rd, vol, days) {
  const phi = Math.sqrt((rd / SCALE) ** 2 + days * vol * vol);
  return Math.min(phi * SCALE, MAX_RD);
}

// Một ván có xếp hạng giữa A và B; scoreA: 1 thắng, 0,5 hòa, 0 thua. Trả về rating mới của hai bên.
export function rateGame(a, b, scoreA, now = Date.now()) {
  const prepare = (r) => ({
    ...r,
    rd: r.lastPlayed ? inflateRd(r.rd, r.vol, Math.max(0, (now - r.lastPlayed) / DAY)) : r.rd,
  });
  const pa = prepare(a);
  const pb = prepare(b);
  const ra = glicko2(pa.rating, pa.rd, pa.vol, [[pb.rating, pb.rd, scoreA]]);
  const rb = glicko2(pb.rating, pb.rd, pb.vol, [[pa.rating, pa.rd, 1 - scoreA]]);
  const finish = (old, next) => ({
    rating: next.rating,
    rd: Math.min(MAX_RD, Math.max(MIN_RD, next.rd)),
    vol: next.sigma,
    games: old.games + 1,
    lastPlayed: now,
  });
  return [finish(a, ra), finish(b, rb)];
}

// ---------- Elo luyện tập với Bot ----------
// Elo nội bộ của từng cấp Bot: khoảng 125 Elo mỗi cấp (đo thực tế, xem tài liệu), neo cấp 1 = 600.
export const botElo = (level) => 600 + 125 * (level - 1);
export const DEFAULT_BOT_RATING = { rating: 1000, games: 0 };

export function expectedScore(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

export function updateBotRating(state, level, score) {
  const k = state.games < 20 ? 40 : 20;
  const rating = state.rating + k * (score - expectedScore(state.rating, botElo(level)));
  return { rating: Math.max(100, rating), games: state.games + 1 };
}

// Cấp Bot gợi ý: cấp mạnh hơn mình một chút (khoảng +50 Elo) để có thử thách.
export function suggestedBotLevel(rating) {
  let best = 1;
  for (let level = 1; level <= 12; level++) {
    if (Math.abs(botElo(level) - (rating + 50)) < Math.abs(botElo(best) - (rating + 50))) best = level;
  }
  return best;
}

// ---------- EXP và cấp độ ----------
export const MAX_LEVEL = 50;
export const xpNeed = (level) => Math.round(100 * level ** 0.9);

export function levelFromXp(xp) {
  let level = 1;
  let into = Math.max(0, xp);
  while (level < MAX_LEVEL && into >= xpNeed(level)) into -= xpNeed(level++);
  return { level, into, need: level < MAX_LEVEL ? xpNeed(level) : 0 };
}

const MIN_PLIES_FOR_XP = 12; // ván quá ngắn (dưới 6 nước mỗi bên) không được EXP

export function onlineXp(result, plies) {
  if (plies < MIN_PLIES_FOR_XP) return 0;
  return 20 + (result === 'win' ? 20 : result === 'draw' ? 10 : 0);
}

export function botXp(level, result, plies) {
  if (plies < MIN_PLIES_FOR_XP) return 0;
  const base = 10 + (result === 'win' ? 20 : result === 'draw' ? 10 : 0);
  return Math.round(base * (0.3 + (0.7 * level) / 12));
}

export const BOT_XP_DAILY_CAP = 300;
