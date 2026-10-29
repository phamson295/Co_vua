// Kho lưu trữ người dùng bằng một file JSON (không cần cơ sở dữ liệu ngoài).
// Ghi file theo kiểu "ghi tạm rồi đổi tên" để không bị hỏng dữ liệu nếu máy chủ tắt giữa chừng.
// Lưu ý khi triển khai: ổ đĩa của gói miễn phí trên Render là tạm thời, dữ liệu sẽ mất sau mỗi lần deploy.
// Muốn giữ lâu dài, hãy gắn ổ đĩa bền vững (DATA_DIR) hoặc thay lớp này bằng cơ sở dữ liệu thật.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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
