// Âm thanh tạo bằng Web Audio (không cần file âm thanh).
let ctx = null;
let enabled = true;

export function setSoundEnabled(value) {
  enabled = value;
}

function audio() {
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Một nốt: tần số `freq` (Hz), kéo dài `dur` giây, bắt đầu sau `delay` giây.
function tone(freq, dur, { type = 'sine', gain = 0.18, delay = 0, slideTo = null } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Tiếng "cộc" của quân gỗ: một nhịp ngắn có điểm rơi nhanh.
function knock(freq, gain = 0.25) {
  tone(freq, 0.09, { type: 'triangle', gain, slideTo: freq * 0.55 });
}

const SOUNDS = {
  move: () => knock(240),
  capture: () => {
    knock(190, 0.32);
    tone(120, 0.14, { type: 'sawtooth', gain: 0.08, delay: 0.01 });
  },
  castle: () => {
    knock(240);
    setTimeout(() => knock(200), 110);
  },
  check: () => {
    knock(240);
    tone(880, 0.16, { type: 'square', gain: 0.07, delay: 0.1 });
  },
  start: () => {
    tone(523, 0.14, { delay: 0 });
    tone(659, 0.18, { delay: 0.12 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { delay: i * 0.12 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.26, { delay: i * 0.16, type: 'triangle' })),
  draw: () => [440, 440].forEach((f, i) => tone(f, 0.2, { delay: i * 0.18 })),
  select: () => tone(620, 0.05, { gain: 0.07 }),
  error: () => tone(160, 0.12, { type: 'square', gain: 0.08 }),
};

export function play(kind) {
  if (!enabled) return;
  try {
    SOUNDS[kind]?.();
  } catch {
    // Không phát được âm thanh thì bỏ qua, không ảnh hưởng ván cờ.
  }
}
