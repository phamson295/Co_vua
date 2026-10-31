// Kho lưu trữ người dùng bằng một file JSON (không cần cơ sở dữ liệu ngoài).
// Ghi file theo kiểu "ghi tạm rồi đổi tên" để không bị hỏng dữ liệu nếu máy chủ tắt giữa chừng.
// Lưu ý khi triển khai: ổ đĩa của gói miễn phí trên Render là tạm thời, dữ liệu sẽ mất sau mỗi lần deploy.
// Muốn giữ lâu dài, hãy gắn ổ đĩa bền vững (DATA_DIR) hoặc thay lớp này bằng cơ sở dữ liệu thật.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_RATING, PROVISIONAL_RD, rateGame, levelFromXp } from '../public/js/rating.js';
import { DEFAULT_PUZZLE_RATING, updatePuzzleRating } from '../public/js/puzzle-core.js';
import { ACHIEVEMENT_IDS } from '../public/js/achievements.js';

const SAVE_DELAY_MS = 300;

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { secret: null, users: {} };
    this.byEmail = new Map(); // email đăng nhập -> id
    this.byProvider = new Map(); // "google:123" -> id
    this.timer = null;
    this.load();
  }

  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Không đọc được file dữ liệu:', error.message);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      this.data = { secret: parsed.secret ?? null, users: parsed.users ?? {} };
    } catch {
      // File hỏng: giữ lại bản sao để cứu dữ liệu thay vì ghi đè mất.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.renameSync(this.file, backup);
      console.warn(`File dữ liệu bị hỏng, đã chuyển sang ${backup} và bắt đầu lại từ đầu.`);
      return;
    }
    for (const user of Object.values(this.data.users)) this.index(user);
  }

  index(user) {
    if (user.loginEmail) this.byEmail.set(user.loginEmail, user.id);
    for (const [provider, id] of Object.entries(user.providers ?? {})) {
      this.byProvider.set(`${provider}:${id}`, user.id);
    }
  }

  // Khóa bí mật dùng ký phiên đăng nhập; tự sinh và lưu lại lần đầu.
  secret() {
    if (!this.data.secret) {
      this.data.secret = crypto.randomBytes(32).toString('hex');
      this.flush();
    }
    return this.data.secret;
  }

  getUser(id) {
    return this.data.users[id] ?? null;
  }

  findByEmail(email) {
    const id = this.byEmail.get(email);
    return id ? this.data.users[id] : null;
  }

  findByProvider(provider, providerId) {
    const id = this.byProvider.get(`${provider}:${providerId}`);
    return id ? this.data.users[id] : null;
  }

  createUser(fields) {
    const user = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      providers: {},
      stats: { online: { played: 0, wins: 0, losses: 0, draws: 0 } },
      ...fields,
    };
    this.data.users[user.id] = user;
    this.index(user);
    this.saveSoon();
    return user;
  }

  // Gắn email + mật khẩu cho tài khoản (nâng cấp tài khoản nhanh).
  setCredentials(user, loginEmail, passwordHash) {
    user.loginEmail = loginEmail;
    user.passwordHash = passwordHash;
    user.kind = 'email';
    this.index(user);
    this.saveSoon();
  }

  // ----- Rating (Glicko-2) theo nhóm thời gian: bullet, blitz, rapid -----
  getRating(user, pool) {
    return user.ratings?.[pool] ?? { ...DEFAULT_RATING };
  }

  // Ghi một ván có xếp hạng; scoreW: 1 Trắng thắng, 0,5 hòa, 0 Đen thắng. Trả về rating trước/sau.
  applyRatedGame(userW, userB, scoreW, pool, now = Date.now()) {
    const before = { w: this.getRating(userW, pool), b: this.getRating(userB, pool) };
    const [w, b] = rateGame(before.w, before.b, scoreW, now);
    userW.ratings = { ...userW.ratings, [pool]: w };
    userB.ratings = { ...userB.ratings, [pool]: b };
    this.saveSoon();
    const change = (old, next) => ({
      before: Math.round(old.rating),
      after: Math.round(next.rating),
      provisional: next.rd > PROVISIONAL_RD,
    });
    return { pool, w: change(before.w, w), b: change(before.b, b) };
  }

  // ----- EXP: cộng dồn, không giảm; nguồn từ Bot có trần mỗi ngày -----
  addXp(user, amount, { source = 'online', dailyCap = Infinity } = {}) {
    const today = new Date().toISOString().slice(0, 10);
    if (user.xpDaily?.date !== today) user.xpDaily = { date: today };
    const used = user.xpDaily[source] ?? 0;
    const gained = Math.max(0, Math.min(amount, dailyCap - used));
    user.xpDaily[source] = used + gained;
    const before = levelFromXp(user.xp ?? 0).level;
    user.xp = (user.xp ?? 0) + gained;
    this.saveSoon();
    const level = levelFromXp(user.xp);
    return { gained, total: user.xp, ...level, levelUp: level.level > before, capped: gained < amount };
  }

  // Bảng xếp hạng: xếp theo cận dưới (rating − 2·RD) để người mới may mắn không vượt lên đầu.
  leaderboard(pool, limit = 50) {
    return Object.values(this.data.users)
      .filter((u) => u.ratings?.[pool]?.games > 0)
      .map((u) => ({ user: u, r: u.ratings[pool] }))
      .sort((a, b) => b.r.rating - 2 * b.r.rd - (a.r.rating - 2 * a.r.rd))
      .slice(0, limit)
      .map(({ user, r }) => ({
        name: user.name,
        rating: Math.round(r.rating),
        games: r.games,
        provisional: r.rd > PROVISIONAL_RD,
      }));
  }

  // ----- Giải đố -----
  recordPuzzle(user, puzzleRating, solved) {
    user.puzzle = updatePuzzleRating({ ...DEFAULT_PUZZLE_RATING, ...user.puzzle }, puzzleRating, solved);
    this.saveSoon();
    return user.puzzle;
  }

  // ----- Thành tựu: hợp nhất danh sách đã mở (giữ thời điểm mở sớm nhất) -----
  mergeAchievements(user, unlocked) {
    user.achievements ??= {};
    for (const [id, at] of Object.entries(unlocked ?? {})) {
      if (!ACHIEVEMENT_IDS.has(id)) continue;
      const time = Number(at) || Date.now();
      if (!user.achievements[id] || time < user.achievements[id]) user.achievements[id] = time;
    }
    this.saveSoon();
    return user.achievements;
  }

  // ----- Quản lý tài khoản -----
  rename(user, name) {
    user.name = name;
    this.saveSoon();
  }

  deleteUser(user) {
    if (user.loginEmail) this.byEmail.delete(user.loginEmail);
    for (const [provider, id] of Object.entries(user.providers ?? {})) this.byProvider.delete(`${provider}:${id}`);
    delete this.data.users[user.id];
    this.saveSoon();
  }

  recordOnline(userId, result) {
    const user = this.getUser(userId);
    if (!user) return;
    const stats = user.stats.online;
    stats.played += 1;
    if (result === 'win') stats.wins += 1;
    else if (result === 'loss') stats.losses += 1;
    else stats.draws += 1;
    this.saveSoon();
  }

  saveSoon() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
}
