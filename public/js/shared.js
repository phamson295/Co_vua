// Phần dùng chung cho trình duyệt và máy chủ: thể thức thời gian, đồng hồ, câu chat nhanh.

// Thể thức thời gian: base = số giây ban đầu, inc = số giây cộng thêm sau mỗi nước.
export const TIME_CONTROLS = [
  { id: 'none', label: 'Không giới hạn', short: '∞', base: 0, inc: 0 },
  { id: '1+0', label: '1 phút', short: '1+0', base: 60, inc: 0 },
  { id: '3+2', label: '3 phút + 2 giây', short: '3+2', base: 180, inc: 2 },
  { id: '5+0', label: '5 phút', short: '5+0', base: 300, inc: 0 },
  { id: '10+0', label: '10 phút', short: '10+0', base: 600, inc: 0 },
  { id: '15+10', label: '15 phút + 10 giây', short: '15+10', base: 900, inc: 10 },
  { id: '30+0', label: '30 phút', short: '30+0', base: 1800, inc: 0 },
];

export const findTimeControl = (id) => TIME_CONTROLS.find((t) => t.id === id) ?? TIME_CONTROLS[0];

// Nhóm xếp hạng theo thời lượng ước tính của ván (giây ban đầu + 40 nước × giây cộng thêm).
export const POOLS = {
  bullet: 'Siêu chớp',
  blitz: 'Cờ chớp',
  rapid: 'Cờ nhanh',
};

export function poolOf(tc) {
  if (!tc || !tc.base) return 'rapid';
  const estimate = tc.base + 40 * tc.inc;
  if (estimate < 180) return 'bullet';
  if (estimate < 480) return 'blitz';
  return 'rapid';
}

// Hiển thị thời gian: "5:00", dưới 20 giây thì có phần mười giây: "0:09.4".
export function formatClock(ms) {
  const value = Math.max(0, ms);
  const totalSeconds = value / 1000;
  if (totalSeconds < 20) {
    const whole = Math.floor(totalSeconds);
    return `0:${String(whole).padStart(2, '0')}.${Math.floor((totalSeconds - whole) * 10)}`;
  }
  const seconds = Math.ceil(totalSeconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Đồng hồ cờ hai mặt. Thời gian tính bằng mili giây; `now` truyền vào để dễ kiểm thử.
// Đồng hồ chưa chạy cho tới khi bên Trắng đi nước đầu tiên (khi đó đồng hồ bên Đen bắt đầu chạy).
export class Clock {
  constructor(baseMs, incMs) {
    this.time = { w: baseMs, b: baseMs };
    this.inc = incMs;
    this.running = null;
    this.since = 0;
  }

  remaining(color, now) {
    return this.time[color] - (this.running === color ? now - this.since : 0);
  }

  // `color` vừa đi xong: trừ thời gian đã dùng, cộng thời gian thưởng, chuyển đồng hồ sang bên kia.
  press(color, now) {
    if (this.running === color) {
      this.time[color] -= now - this.since;
      this.time[color] += this.inc;
    }
    this.running = color === 'w' ? 'b' : 'w';
    this.since = now;
  }

  stop(now) {
    if (this.running) this.time[this.running] -= now - this.since;
    this.running = null;
  }

  snapshot(now) {
    return { w: Math.round(this.remaining('w', now)), b: Math.round(this.remaining('b', now)), running: this.running };
  }
}

// Bên còn đủ quân để có thể chiếu hết không (dùng khi đối phương hết giờ: không đủ quân thì xử hòa).
export function hasMatingMaterial(board, color) {
  let minors = 0;
  for (const p of board) {
    if (!p || p[0] !== color) continue;
    if (p[1] === 'P' || p[1] === 'R' || p[1] === 'Q') return true;
    if (p[1] === 'N' || p[1] === 'B') minors++;
  }
  return minors >= 2;
}

// Câu chat nhanh (chỉ gửi số thứ tự, không cho gõ tự do nên không cần kiểm duyệt nội dung).
export const CHAT_PHRASES = ['Xin chào!', 'Chúc may mắn!', 'Nước đi hay!', 'Ối!', 'Cảm ơn!', 'Ván cờ hay!', 'Đánh lại nhé?', 'Tạm biệt!'];
