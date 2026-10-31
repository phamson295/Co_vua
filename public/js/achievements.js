// Thành tựu: định nghĩa (dùng chung với máy chủ để kiểm tra mã hợp lệ) và cách chấm sau mỗi ván / mỗi bài giải đố.
// Sự kiện "game": { mode, outcome: 'win'|'lose'|'draw'|null, reason, moves, me: 'w'|'b'|null, level, rated, view3d }
// Sự kiện "puzzle": { solved, streak, rating, totalSolved }

const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

export const ACHIEVEMENTS = [
  // Ván cờ
  { id: 'first_game', icon: '♟', name: 'Nước đi đầu tiên', desc: 'Chơi xong một ván cờ.', points: 10, group: 'Ván cờ' },
  { id: 'games_10', icon: '🎯', name: 'Chăm chỉ', desc: 'Chơi xong 10 ván.', points: 15, group: 'Ván cờ', goal: { key: 'games', value: 10 } },
  { id: 'games_50', icon: '🏅', name: 'Kỳ thủ bền bỉ', desc: 'Chơi xong 50 ván.', points: 30, group: 'Ván cờ', goal: { key: 'games', value: 50 } },
  { id: 'first_win', icon: '🥇', name: 'Chiến thắng đầu tiên', desc: 'Thắng một ván với máy hoặc online.', points: 10, group: 'Ván cờ' },
  { id: 'bot_5', icon: '🤖', name: 'Vượt cấp 5', desc: 'Thắng máy từ cấp 5 trở lên.', points: 20, group: 'Ván cờ' },
  { id: 'bot_9', icon: '🦾', name: 'Hạ máy giỏi', desc: 'Thắng máy từ cấp 9 trở lên.', points: 40, group: 'Ván cờ' },
  { id: 'bot_12', icon: '👑', name: 'Chinh phục Chuyên gia', desc: 'Thắng máy cấp 12.', points: 100, group: 'Ván cờ' },
  { id: 'online_win', icon: '🌐', name: 'Thắng online', desc: 'Thắng một ván online.', points: 20, group: 'Ván cờ' },
  { id: 'rated_win', icon: '📈', name: 'Leo hạng', desc: 'Thắng một ván online có tính điểm.', points: 25, group: 'Ván cờ' },
  { id: 'local_game', icon: '🤝', name: 'Bạn cờ', desc: 'Chơi xong một ván hai người trên một máy.', points: 10, group: 'Ván cờ' },
  { id: 'view_3d', icon: '🧊', name: 'Ba chiều', desc: 'Chơi xong một ván ở chế độ 3D.', points: 10, group: 'Ván cờ' },
  // Kỹ thuật
  { id: 'castle', icon: '🏰', name: 'Nhập thành', desc: 'Nhập thành trong một ván.', points: 10, group: 'Kỹ thuật' },
  { id: 'en_passant', icon: '👻', name: 'Bắt tốt qua đường', desc: 'Bắt tốt qua đường (en passant).', points: 15, group: 'Kỹ thuật' },
  { id: 'underpromotion', icon: '🐴', name: 'Phong cấp lạ', desc: 'Phong cấp thành Xe, Tượng hoặc Mã.', points: 25, group: 'Kỹ thuật' },
  { id: 'knight_mate', icon: '♞', name: 'Kỵ sĩ kết liễu', desc: 'Chiếu hết bằng quân Mã.', points: 25, group: 'Kỹ thuật' },
  { id: 'quick_mate', icon: '⚡', name: 'Tốc chiến', desc: 'Thắng bằng chiếu hết trong 20 nước.', points: 25, group: 'Kỹ thuật' },
  { id: 'clean_win', icon: '🛡', name: 'Bất khả xâm phạm', desc: 'Thắng mà không bị mất quân nào.', points: 40, group: 'Kỹ thuật' },
  { id: 'comeback', icon: '🔥', name: 'Lội ngược dòng', desc: 'Thắng sau khi từng kém từ 5 điểm quân trở lên.', points: 40, group: 'Kỹ thuật', hidden: true },
  { id: 'time_win', icon: '⏱', name: 'Thắng trên đồng hồ', desc: 'Thắng vì đối phương hết giờ.', points: 15, group: 'Kỹ thuật' },
  { id: 'marathon', icon: '🏃', name: 'Ván cờ marathon', desc: 'Chơi xong một ván dài từ 80 nước trở lên.', points: 15, group: 'Kỹ thuật' },
  // Giải đố
  { id: 'puzzle_1', icon: '🧩', name: 'Nhà giải đố', desc: 'Giải đúng bài giải đố đầu tiên.', points: 10, group: 'Giải đố' },
  { id: 'puzzle_25', icon: '🧠', name: 'Óc chiến thuật', desc: 'Giải đúng 25 bài giải đố.', points: 30, group: 'Giải đố', goal: { key: 'puzzles', value: 25 } },
  { id: 'puzzle_streak_5', icon: '🎇', name: 'Chuỗi 5', desc: 'Giải đúng 5 bài liên tiếp.', points: 25, group: 'Giải đố' },
  { id: 'puzzle_1400', icon: '💡', name: 'Puzzle 1400', desc: 'Đạt Puzzle Rating 1400.', points: 30, group: 'Giải đố' },
  { id: 'puzzle_1800', icon: '💎', name: 'Puzzle 1800', desc: 'Đạt Puzzle Rating 1800.', points: 60, group: 'Giải đố' },
];

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));
export const achievementPoints = (unlocked) =>
  ACHIEVEMENTS.reduce((sum, a) => sum + (unlocked[a.id] ? a.points : 0), 0);

// Mức chênh lệch quân (theo góc nhìn `me`) thấp nhất trong suốt ván.
function worstMaterial(moves, me) {
  let balance = 0;
  let worst = 0;
  for (const m of moves) {
    if (m.captured) balance += (m.piece[0] === me ? 1 : -1) * PIECE_VALUE[m.captured[1]];
    if (m.promo) balance += (m.piece[0] === me ? 1 : -1) * (PIECE_VALUE[m.promo] - 1);
    worst = Math.min(worst, balance);
  }
  return worst;
}

function gameChecks(e) {
  const moves = e.moves;
  const mine = (m) => e.me === null || m.piece[0] === e.me;
  const competitive = e.mode === 'ai' || e.mode === 'online';
  const win = competitive && e.outcome === 'win';
  const last = moves[moves.length - 1];
  return {
    first_game: true,
    first_win: win,
    bot_5: win && e.mode === 'ai' && e.level >= 5,
    bot_9: win && e.mode === 'ai' && e.level >= 9,
    bot_12: win && e.mode === 'ai' && e.level >= 12,
    online_win: win && e.mode === 'online',
    rated_win: win && e.mode === 'online' && e.rated,
    local_game: e.mode === 'local',
    view_3d: Boolean(e.view3d),
    castle: moves.some((m) => mine(m) && m.castle),
    en_passant: moves.some((m) => mine(m) && m.ep),
    underpromotion: moves.some((m) => mine(m) && m.promo && m.promo !== 'Q'),
    knight_mate: win && e.reason === 'checkmate' && last?.piece[1] === 'N',
    quick_mate: win && e.reason === 'checkmate' && moves.length <= 40,
    clean_win: win && !moves.some((m) => m.captured && m.captured[0] === e.me),
    comeback: win && worstMaterial(moves, e.me) <= -5,
    time_win: win && e.reason === 'timeout',
    marathon: moves.length >= 160,
  };
}

function puzzleChecks(e) {
  return {
    puzzle_1: e.solved,
    puzzle_streak_5: e.streak >= 5,
    puzzle_1400: e.rating >= 1400,
    puzzle_1800: e.rating >= 1800,
  };
}

// Cập nhật tiến trình và trả về các thành tựu vừa mở khóa.
// progress: { unlocked: { id: thời_điểm }, counters: { games, puzzles } }
export function evaluate(progress, event) {
  progress.unlocked ??= {};
  progress.counters ??= {};
  let checks;
  if (event.type === 'game') {
    if (event.moves.length < 2) return [];
    progress.counters.games = (progress.counters.games ?? 0) + 1;
    checks = gameChecks(event);
  } else {
    if (event.solved) progress.counters.puzzles = (progress.counters.puzzles ?? 0) + 1;
    checks = puzzleChecks(event);
  }
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (progress.unlocked[a.id]) continue;
    const reached = a.goal ? (progress.counters[a.goal.key] ?? 0) >= a.goal.value : checks[a.id];
    if (reached) {
      progress.unlocked[a.id] = Date.now();
      fresh.push(a);
    }
  }
  return fresh;
}
