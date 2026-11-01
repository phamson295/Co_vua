// Giao diện và điều khiển: chơi với máy, hai người một máy, chơi online; bàn cờ 2D và 3D;
// đồng hồ, xem lại nước đi, gợi ý, lưu ván, Elo luyện tập, xếp hạng và EXP.
import { Game, opponent, isInCheck, applyMove, legalMoves, toUci, attackers } from './engine.js';
import { LEVELS } from './ai.js';
import { pieceSvg } from './pieces.js';
import { play as playSound, setSoundEnabled } from './sound.js';
import { initAccount, getUser, refreshAccount, rerenderAccount } from './account.js';
import { t, initI18n, setLanguage, getLanguage } from './i18n.js';
import { LANGUAGES, flagSvg } from './languages.js';
import { playCheckFx } from './chibi.js';
import { TIME_CONTROLS, findTimeControl, formatClock, Clock, hasMatingMaterial, CHAT_PHRASES, POOLS } from './shared.js';
import { botElo, DEFAULT_BOT_RATING, updateBotRating, suggestedBotLevel } from './rating.js';
import { PUZZLE_TYPES, isCheckmate, mateMoves, forcesMateIn2, DEFAULT_PUZZLE_RATING, updatePuzzleRating, pickPuzzle } from './puzzle-core.js';
import { ACHIEVEMENTS, evaluate as evaluateAchievements, achievementPoints } from './achievements.js';

const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
await initI18n();

const pieceName = (type) => t(`piece.${type}`);
const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
const colorName = (c) => t(`color.${c}`);
const FILES = 'abcdefgh';
const reasonText = (reason) => t(`reason.${reason}`);

// ---------- Thiết lập giao diện ----------
const PIECE_OPTIONS = [
  { value: 'classic', key: 'opt.pieces.classic' },
  { value: 'modern', key: 'opt.pieces.modern' },
  { value: 'glyph', key: 'opt.pieces.glyph' },
  { value: 'letters', key: 'opt.pieces.letters' },
];
const BOARD_OPTIONS = [
  { value: 'wood', key: 'opt.board.wood', l: '#f0d9b5', d: '#b58863', f: '#5b3a1e' },
  { value: 'green', key: 'opt.board.green', l: '#eeeed2', d: '#769656', f: '#3f5a2a' },
  { value: 'blue', key: 'opt.board.blue', l: '#dee3e6', d: '#8ca2ad', f: '#3d5566' },
  { value: 'marble', key: 'opt.board.marble', l: '#f7f7f5', d: '#a9b4bd', f: '#6c7780' },
  { value: 'night', key: 'opt.board.night', l: '#6b7a93', d: '#2f3a4f', f: '#151a24' },
];
const VIEW_OPTIONS = [
  { value: '2d', label: '2D' },
  { value: '3d', label: '3D' },
];
const THEME_OPTIONS = [
  { value: 'auto', key: 'opt.theme.auto' },
  { value: 'light', key: 'opt.theme.light' },
  { value: 'dark', key: 'opt.theme.dark' },
];
const SEATING_OPTIONS = [
  { value: 'facing', key: 'opt.seating.facing' },
  { value: 'rotate', key: 'opt.seating.rotate' },
  { value: 'same', key: 'opt.seating.same' },
];
const CHOICES = { pieces: PIECE_OPTIONS, board: BOARD_OPTIONS, view: VIEW_OPTIONS, theme: THEME_OPTIONS, seating: SEATING_OPTIONS };
const DEFAULT_SETTINGS = {
  pieces: 'classic',
  board: 'wood',
  view: '2d',
  theme: 'auto',
  sound: true,
  hints: true,
  coords: true,
  checkFx: true, // hoạt ảnh chibi khi chiếu tướng
  seating: 'facing', // hai người: 'facing' đối diện | 'rotate' xoay bàn theo lượt | 'same' cùng một phía
};
const SETTINGS_KEY = 'co-vua-settings';
const PREFS_KEY = 'co-vua-prefs'; // lựa chọn gần nhất ở các màn hình thiết lập
const SAVED_GAME_KEY = 'co-vua-saved-game';
const BOT_RATING_KEY = 'co-vua-bot-rating';
const ROOM_KEY = 'co-vua-room'; // phòng online đang chơi (để nối lại khi tải lại trang)

const $ = (sel) => document.querySelector(sel);
const els = {
  screens: { menu: $('#menu'), ai: $('#ai-setup'), local: $('#local-setup'), online: $('#online-setup'), game: $('#game'), about: $('#about') },
  board: $('#board'),
  board3d: $('#board3d'),
  playerTop: $('#player-top'),
  playerBottom: $('#player-bottom'),
  gameTitle: $('#game-title'),
  gameBadges: $('#game-badges'),
  status: $('#status'),
  offerBar: $('#offer-bar'),
  offerText: $('#offer-text'),
  offerAccept: $('#offer-accept'),
  offerDecline: $('#offer-decline'),
  chatBar: $('#chat-bar'),
  moves: $('#moves'),
  reviewPos: $('#review-pos'),
  reviewBanner: $('#review-banner'),
  reviewText: $('#review-text'),
  aiColor: $('#ai-color'),
  aiLevel: $('#ai-level'),
  levelText: $('#level-text'),
  levelDesc: $('#level-desc'),
  practiceBox: $('#practice-box'),
  roomCode: $('#room-code'),
  roomBox: $('#room-box'),
  roomCodeText: $('#room-code-text'),
  roomInfo: $('#room-info'),
  onlineMsg: $('#online-msg'),
  onlineRated: $('#online-rated'),
  ratedHint: $('#rated-hint'),
  resumeCard: $('#resume-card'),
  resumeDesc: $('#resume-desc'),
  settingsDialog: $('#settings-dialog'),
  leaderboardDialog: $('#leaderboard-dialog'),
  promoDialog: $('#promo-dialog'),
  promoChoices: $('#promo-choices'),
  resultDialog: $('#result-dialog'),
  resultIcon: $('#result-icon'),
  resultTitle: $('#result-title'),
  resultText: $('#result-text'),
  resultExtra: $('#result-extra'),
  resultNew: $('#result-new'),
  resultRematch: $('#result-rematch'),
  toast: $('#toast'),
  achievementsDialog: $('#achievements-dialog'),
  seekBox: $('#seek-box'),
  seekText: $('#seek-text'),
};

// ---------- Trạng thái ----------
let game = new Game();
let mode = null; // 'local' | 'ai' | 'online' | 'puzzle'
let tcId = 'none';
let clock = null; // đồng hồ (null khi không giới hạn thời gian)
let humanColor = 'w';
let aiLevel = 5;
let assisted = false; // đã dùng hoàn tác/gợi ý trong ván với máy (không tính Elo luyện tập)
let selected = null;
let hintMove = null;
let viewPly = null; // đang xem lại nước thứ mấy (null = nước hiện tại)
let flipped = false; // người chơi bấm "Lật bàn"
let finished = null; // { winner, reason } khi ván kết thúc không phải do luật cờ (đầu hàng, hết giờ...)
let lastEnd = { over: false };
let endHandled = false;
let resultExtra = {};
let resultTimer = 0;
let aiThinking = false;
let aiRequestId = 0;
let hintRequest = null;
let hintCounter = 0;
let lastView = null;
let barColors = { top: 'b', bottom: 'w' };
let board3d = null;
let board3dLoading = null;
let toastTimer = 0;

// Online
let socket = null;
let socketReady = false;
let reconnectTimer = 0;
let reconnectAttempts = 0;
let myColor = 'w';
let onlineInfo = { names: {}, ratings: {}, rated: false, tc: null, code: '' };
let awaitingServer = false;
let offer = null; // 'draw_received' | 'draw_sent' | 'rematch_received' | 'rematch_sent'
let opponentAwayUntil = 0; // thời điểm hết hạn chờ đối thủ mất kết nối (0 = đang kết nối)
let opponentGone = false;
let lastOver = null; // thông báo kết thúc ván từ máy chủ (có rating, EXP)
let seekTimer = 0;
let seekStarted = 0;

// Giải đố
let puzzle = null; // { data, playerColor, status: 'playing' | 'solved' | 'failed' | 'reviewed', reported }
let puzzleList = null;
let puzzleRatingChange = null;
const bubbleTimers = {};

const aiWorker = new Worker('js/ai-worker.js', { type: 'module' });

// ---------- Lưu trữ cục bộ ----------
function readJson(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Trình duyệt không cho lưu (chế độ ẩn danh...): vẫn chơi bình thường.
  }
}

const prefs = { aiTc: 'none', localTc: 'none', onlineTc: '5+0', onlineRated: true, aiColor: 'w', aiLevel: 5, ...readJson(localStorage, PREFS_KEY, {}) };
const savePrefs = () => writeJson(localStorage, PREFS_KEY, prefs);
const loadBotRating = () => ({ ...DEFAULT_BOT_RATING, ...readJson(localStorage, BOT_RATING_KEY, {}) });
const roomSession = () => readJson(sessionStorage, ROOM_KEY, null);

// ---------- Thiết lập: đọc, lưu, áp dụng ----------
const settings = loadSettings();

function loadSettings() {
  const saved = readJson(localStorage, SETTINGS_KEY, {});
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = saved[key];
    const valid = CHOICES[key] ? CHOICES[key].some((o) => o.value === value) : typeof value === 'boolean';
    if (valid) result[key] = value;
  }
  return result;
}

function setSetting(key, value) {
  settings[key] = value;
  writeJson(localStorage, SETTINGS_KEY, settings);
  applySettings();
  render();
}

const SOUND_ICON = {
  on: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>',
};

const iconStyle = () => (settings.pieces === 'modern' ? 'modern' : 'classic');

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  for (const opt of BOARD_OPTIONS) els.board.classList.toggle(`theme-${opt.value}`, opt.value === settings.board);
  els.board.classList.toggle('coords-off', !settings.coords);
  setSoundEnabled(settings.sound);
  $('#btn-sound').innerHTML = settings.sound ? SOUND_ICON.on : SOUND_ICON.off;
  $('#brand-logo').innerHTML = pieceSvg(iconStyle(), 'wN');
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = pieceSvg(iconStyle(), el.dataset.icon);
  });
  for (const key of Object.keys(CHOICES)) {
    $(`#opt-${key}`)
      .querySelectorAll('[role="radio"]')
      .forEach((btn) => btn.setAttribute('aria-checked', String(btn.dataset.value === settings[key])));
  }
  for (const key of ['sound', 'hints', 'coords', 'checkFx']) $(`#opt-${key}`).checked = settings[key];
  $('#local-seating')
    .querySelectorAll('[role="radio"]')
    .forEach((btn) => btn.setAttribute('aria-checked', String(btn.dataset.value === settings.seating)));
  applyView();
  if (settings.view === '3d') ensure3D();
}

// Hiện bàn 2D hoặc 3D tùy thiết lập (bàn 3D chỉ hiện khi đã nạp xong).
function applyView() {
  const show3d = settings.view === '3d' && board3d !== null;
  els.board.hidden = show3d;
  els.board3d.hidden = !show3d;
  if (show3d) board3d.resize();
}

async function ensure3D() {
  if (board3d) return;
  if (!board3dLoading) {
    board3dLoading = (async () => {
      try {
        const module = await import('./board3d.js');
        board3d = module.createBoard3D(els.board3d, { onSquare });
      } catch (error) {
        console.warn('Không bật được chế độ 3D:', error);
        board3d = null;
        settings.view = '2d';
        applySettings();
        toast(t('toast.no3d'));
      } finally {
        board3dLoading = null;
      }
    })();
  }
  await board3dLoading;
  applyView();
  render();
}

function buildChoices(key, container, withPreview) {
  container.innerHTML = '';
  for (const opt of CHOICES[key]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.dataset.value = opt.value;
    if (withPreview) {
      btn.className = 'chip';
      btn.innerHTML = `${choicePreview(key, opt)}<span>${opt.key ? t(opt.key) : opt.label}</span>`;
    } else {
      btn.textContent = opt.key ? t(opt.key) : opt.label;
    }
    btn.addEventListener('click', () => setSetting(key, opt.value));
    container.append(btn);
  }
}

function choicePreview(key, opt) {
  if (key === 'board') return `<span class="swatch" style="--l:${opt.l};--d:${opt.d};--f:${opt.f}"></span>`;
  if (opt.value === 'glyph') return `<span class="chip-preview glyph">${GLYPH.N}</span>`;
  if (opt.value === 'letters') return '<span class="chip-preview letters"><span>N</span></span>';
  return `<span class="chip-preview svg">${pieceSvg(opt.value, 'wN')}</span>`;
}

buildChoices('pieces', $('#opt-pieces'), true);
buildChoices('board', $('#opt-board'), true);
buildChoices('view', $('#opt-view'), false);
buildChoices('theme', $('#opt-theme'), false);
buildChoices('seating', $('#opt-seating'), false);
buildChoices('seating', $('#local-seating'), false);
for (const key of ['sound', 'hints', 'coords', 'checkFx']) {
  $(`#opt-${key}`).addEventListener('change', (e) => setSetting(key, e.target.checked));
}

// Ô chọn thể thức thời gian (dùng ở cả ba màn hình thiết lập).
function buildTcChips(container, prefKey) {
  container.innerHTML = '';
  for (const tc of TIME_CONTROLS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tc-chip';
    btn.setAttribute('role', 'radio');
    btn.dataset.value = tc.id;
    btn.innerHTML = `<strong>${tc.short}</strong><span>${t(`tc.chip.${tc.id}`)}</span>`;
    btn.addEventListener('click', () => {
      prefs[prefKey] = tc.id;
      savePrefs();
      syncTcChips(container, tc.id);
    });
    container.append(btn);
  }
  syncTcChips(container, prefs[prefKey]);
}

function syncTcChips(container, id) {
  container.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === id)));
}

buildTcChips($('#ai-tc'), 'aiTc');
buildTcChips($('#local-tc'), 'localTc');
buildTcChips($('#online-tc'), 'onlineTc');

// ---------- Bàn cờ 2D ----------
// Tạo 64 ô một lần; mỗi ô có phần tử quân và hai nhãn tọa độ, sau đó chỉ cập nhật nội dung.
const squares = [];
const pieceEls = [];
const rankEls = [];
const fileEls = [];
for (let i = 0; i < 64; i++) {
  const sq = document.createElement('div');
  sq.dataset.i = i;
  const pc = document.createElement('span');
  pc.className = 'pc';
  const rank = document.createElement('i');
  rank.className = 'co co-r';
  const file = document.createElement('i');
  file.className = 'co co-f';
  sq.append(pc, rank, file);
  squares.push(sq);
  pieceEls.push(pc);
  rankEls.push(rank);
  fileEls.push(file);
  els.board.append(sq);
}

function paintPiece(el, piece) {
  const key = piece ? `${settings.pieces}:${piece}` : '';
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.textContent = '';
  el.removeAttribute('data-letter');
  el.removeAttribute('data-color');
  if (!piece) {
    el.className = 'pc';
    return;
  }
  const colorClass = piece[0] === 'w' ? 'pw' : 'pb';
  el.dataset.color = piece[0];
  if (settings.pieces === 'glyph') {
    el.className = `pc pk-glyph ${colorClass}`;
    el.textContent = GLYPH[piece[1]];
  } else if (settings.pieces === 'letters') {
    el.className = `pc pk-letters ${colorClass}`;
    el.dataset.letter = piece[1];
  } else {
    el.className = 'pc';
    el.innerHTML = pieceSvg(settings.pieces, piece);
  }
}

function render2d(vm) {
  els.board.classList.toggle('flipped', vm.view === 'b');
  // Chỉ chế độ hai người ngồi đối diện mới xoay cả quân; còn lại quân luôn đứng thẳng khi lật bàn.
  els.board.classList.toggle('upright', vm.upright);
  // Ngồi đối diện: bàn đứng yên, quân Đen quay về phía người cầm Đen.
  els.board.classList.toggle('facing', vm.facing);
  const rankCol = vm.view === 'w' ? 0 : 7;
  const fileRow = vm.view === 'w' ? 7 : 0;
  squares.forEach((sq, i) => {
    const r = i >> 3;
    const c = i & 7;
    paintPiece(pieceEls[i], vm.board[i]);
    sq.className = 'sq ' + ((r + c) % 2 ? 'dark' : 'light');
    if (vm.last && (i === vm.last.from || i === vm.last.to)) sq.classList.add('last');
    if (vm.hint && (i === vm.hint.from || i === vm.hint.to)) sq.classList.add('hint');
    if (i === vm.selected) sq.classList.add('sel');
    if (vm.targets.has(i)) sq.classList.add(vm.board[i] ? 'capture' : 'target');
    if (i === vm.kingSquare) sq.classList.add('check');
    rankEls[i].textContent = c === rankCol ? String(8 - r) : '';
    fileEls[i].textContent = r === fileRow ? FILES[c] : '';
  });
}

// Quân trượt từ ô đi sang ô đến (bù lại việc bàn cờ có thể đang xoay 180 độ).
function animateMove2d(move) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const pairs = [[move.from, move.to]];
  if (move.castle) pairs.push([move.to > move.from ? move.from + 3 : move.from - 4, (move.from + move.to) / 2]);
  // Bàn xoay 180° đảo chiều dịch chuyển; quân được xoay ngược lại (upright) thì đảo thêm lần nữa.
  const isFlipped = els.board.classList.contains('flipped');
  const isUpright = isFlipped && els.board.classList.contains('upright');
  // Quân Đen đang quay ngược (ngồi đối diện) cũng làm đảo chiều dịch chuyển.
  const facingBlack = els.board.classList.contains('facing') && move.piece[0] === 'b';
  const sign = (isFlipped && !isUpright ? -1 : 1) * (facingBlack ? -1 : 1);
  for (const [from, to] of pairs) {
    const a = squares[from].getBoundingClientRect();
    const b = squares[to].getBoundingClientRect();
    const dx = (a.left - b.left) * sign;
    const dy = (a.top - b.top) * sign;
    squares[to].style.zIndex = '5';
    const animation = pieceEls[to].animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 200, easing: 'ease-out' },
    );
    animation.onfinish = () => {
      squares[to].style.zIndex = '';
    };
  }
}

// ---------- Thông tin ván ----------
const use3D = () => settings.view === '3d' && board3d !== null;

// Bên nào được nhìn bàn cờ từ phía dưới.
function viewColor() {
  let color;
  if (mode === 'ai') color = humanColor;
  else if (mode === 'online') color = myColor;
  else if (mode === 'puzzle') color = puzzle.playerColor;
  else color = settings.seating === 'rotate' && viewPly === null ? game.turn : 'w';
  return flipped ? opponent(color) : color;
}

function endInfo() {
  if (finished) return { over: true, ...finished };
  const status = game.status();
  return status.over ? { over: true, winner: status.winner, reason: status.reason } : { over: false };
}

function outcomeFor(winner) {
  if (!winner) return 'draw';
  if (mode === 'ai') return winner === humanColor ? 'win' : 'lose';
  if (mode === 'online') return winner === myColor ? 'win' : 'lose';
  return 'win';
}

// Tên gọi một bên trong câu thông báo: "Bạn", "Máy", "Đối thủ" hoặc "Quân Trắng".
function sideLabel(color) {
  if (mode === 'ai') return color === humanColor ? t('side.you') : t('side.computer');
  if (mode === 'online') return color === myColor ? t('side.you') : t('side.opponent');
  return t('side.color', { color: colorName(color) });
}

function describeEnd(end) {
  const outcome = end.reason === 'disconnect' ? 'info' : outcomeFor(end.winner);
  let title;
  if (outcome === 'info') title = t('end.interrupted');
  else if (outcome === 'draw') title = t('end.draw');
  else if (mode === 'local') title = t('end.colorWins', { color: colorName(end.winner) });
  else title = outcome === 'win' ? t('end.youWin') : t('end.youLose');

  const loser = end.winner ? opponent(end.winner) : null;
  const special = {
    resign: () => t('end.resigned', { who: sideLabel(loser) }),
    timeout: () => t('end.flagged', { who: sideLabel(loser) }),
    abandon: () => t('end.abandoned', { who: sideLabel(loser) }),
  };
  const text = special[end.reason] ? special[end.reason]() : reasonText(end.reason);
  return { outcome, title, text };
}

function statusText(end, check) {
  if (mode === 'puzzle') return puzzleStatusText();
  if (end.over) {
    const d = describeEnd(end);
    return `${d.title} · ${d.text}`;
  }
  if (mode === 'online') {
    if (!socketReady) return t('status.reconnecting');
    if (opponentAwayUntil) {
      const left = Math.max(0, Math.ceil((opponentAwayUntil - Date.now()) / 1000));
      return t('status.opponentAway', { seconds: left });
    }
  }
  if (aiThinking) return t('status.thinking');
  const prefix = check ? `${t('status.check')} ` : '';
  if (mode === 'online') return game.turn === myColor ? prefix + t('status.yourTurn') : t('status.waitOpponent');
  if (mode === 'ai') return game.turn === humanColor ? prefix + t('status.yourTurn') : t('status.computerTurn');
  return prefix + t('status.colorTurn', { color: colorName(game.turn) });
}

function playerInfo(color) {
  if (mode === 'puzzle') {
    if (color === puzzle.playerColor) {
      return { name: getUser()?.name ?? t('side.you'), rating: `Puzzle ${Math.round(puzzleProgress().rating)}`, sub: t('player.youColor', { color: colorName(color) }) };
    }
    return { name: t('player.puzzleNo', { id: puzzle.data.id.replace('p', '#') }), rating: '', sub: t('player.difficulty', { rating: puzzle.data.rating }) };
  }
  if (mode === 'ai') {
    if (color === humanColor) {
      return { name: getUser()?.name ?? t('side.you'), rating: `Elo ${Math.round(loadBotRating().rating)}`, sub: t('player.youColor', { color: colorName(color) }) };
    }
    return {
      name: t('player.computerLevel', { level: aiLevel }),
      rating: `Elo ${botElo(aiLevel)}`,
      sub: aiThinking ? t('player.thinking') : t(`level.${aiLevel}`),
    };
  }
  if (mode === 'online') {
    const r = onlineInfo.ratings?.[color];
    const mine = color === myColor;
    let sub = t(mine ? 'player.youColor' : 'player.opponentColor', { color: colorName(color) });
    if (!mine && opponentAwayUntil) sub = t('player.disconnected');
    if (!mine && opponentGone) sub = t('player.left');
    return {
      name: onlineInfo.names?.[color] || (mine ? t('side.you') : t('side.opponent')),
      rating: r ? `${r.rating}${r.provisional ? '?' : ''}` : '',
      sub,
    };
  }
  return { name: t('side.color', { color: colorName(color) }), rating: '', sub: t('player.playerN', { n: color === 'w' ? 1 : 2 }) };
}

// Quân của đối phương mà `color` đã ăn trong `ply` nước đầu, xếp từ giá trị cao đến thấp.
function capturedBy(color, ply) {
  return game.moves
    .slice(0, ply)
    .filter((m) => m.piece[0] === color && m.captured)
    .map((m) => m.captured)
    .sort((a, b) => PIECE_VALUE[b[1]] - PIECE_VALUE[a[1]]);
}

function renderPlayer(el, color, end, ply) {
  const info = playerInfo(color);
  el.dataset.color = color;
  el.querySelector('.pname').textContent = info.name;
  el.querySelector('.prating').textContent = info.rating ? `(${info.rating})` : '';
  el.querySelector('.psub').textContent = info.sub;
  el.querySelector('.avatar').innerHTML = pieceSvg(iconStyle(), `${color}K`);
  el.classList.toggle('active', !end.over && game.turn === color);
  el.classList.toggle('thinking', aiThinking && mode === 'ai' && color !== humanColor);

  const mine = capturedBy(color, ply);
  const theirs = capturedBy(opponent(color), ply);
  const value = (list) => list.reduce((s, p) => s + PIECE_VALUE[p[1]], 0);
  const advantage = value(mine) - value(theirs);
  el.querySelector('.pcap').innerHTML =
    mine.map((p) => `<span class="cp ${p[0] === 'w' ? 'pw' : 'pb'}">${GLYPH[p[1]]}</span>`).join('') +
    (advantage > 0 ? `<span class="adv">+${advantage}</span>` : '');
}

function renderClocks() {
  const now = performance.now();
  for (const [key, el] of [['top', els.playerTop], ['bottom', els.playerBottom]]) {
    const clockEl = el.querySelector('.clock');
    clockEl.hidden = !clock;
    if (!clock) continue;
    const color = barColors[key];
    const left = clock.remaining(color, now);
    clockEl.textContent = formatClock(left);
    clockEl.classList.toggle('running', clock.running === color && !lastEnd.over);
    clockEl.classList.toggle('low', left < 20000);
  }
}

function renderMoves(ply) {
  const total = game.moves.length;
  els.reviewPos.textContent = total ? `${ply}/${total}` : '';
  if (total === 0) {
    els.moves.innerHTML = `<li><span class="empty">${t('moves.empty')}</span></li>`;
    return;
  }
  const rows = [];
  for (let i = 0; i < total; i += 2) {
    const cell = (index) => {
      const m = game.moves[index];
      return m ? `<button class="m${index + 1 === ply ? ' cur' : ''}" data-ply="${index + 1}">${m.san}</button>` : '<span></span>';
    };
    rows.push(`<li><span class="n">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</li>`);
  }
  els.moves.innerHTML = rows.join('');
  const current = els.moves.querySelector('.cur');
  if (current) els.moves.scrollTop = current.offsetTop - els.moves.clientHeight / 2;
}

function setTool(name, visible, enabled = true) {
  const btn = $(`#tool-${name}`);
  btn.hidden = !visible;
  btn.disabled = !enabled;
}

function renderToolbar(end) {
  const reviewing = viewPly !== null;
  const humanTurn = mode === 'ai' && game.turn === humanColor && !aiThinking;
  if (mode === 'puzzle') {
    for (const name of ['undo', 'draw', 'resign', 'rematch', 'new', 'pgn']) setTool(name, false);
    setTool('hint', true, puzzle.status === 'playing' && !reviewing);
    setTool('next', true);
    setTool('flip', true);
    setTool('cam', use3D());
    setTool('home', true);
    return;
  }
  setTool('next', false);
  setTool('hint', mode === 'ai', humanTurn && !end.over && !reviewing && hintRequest === null);
  setTool('undo', (mode === 'ai' || mode === 'local') && !clock, game.moves.length > 0 && !aiThinking);
  setTool('draw', mode === 'online' && !end.over, socketReady && offer !== 'draw_sent');
  setTool('resign', (mode === 'ai' || mode === 'online') && !end.over, mode !== 'online' || socketReady);
  setTool('rematch', mode === 'online' && end.over, socketReady && !opponentGone && offer !== 'rematch_sent');
  setTool('new', mode === 'ai' || mode === 'local');
  setTool('flip', true);
  setTool('cam', use3D());
  setTool('pgn', true, game.moves.length > 0);
  setTool('home', true);
}

function renderOfferBar() {
  const texts = {
    draw_received: t('offer.drawReceived'),
    draw_sent: t('offer.drawSent'),
    rematch_received: t('offer.rematchReceived'),
    rematch_sent: t('offer.rematchSent'),
  };
  els.offerBar.hidden = !offer;
  if (!offer) return;
  els.offerText.textContent = texts[offer];
  const needsReply = offer === 'draw_received' || offer === 'rematch_received';
  els.offerAccept.hidden = !needsReply;
  els.offerDecline.hidden = !needsReply;
  els.offerAccept.textContent = offer === 'rematch_received' ? t('offer.rematchAccept') : t('offer.drawAccept');
}

function renderHeader() {
  if (mode === 'puzzle') {
    els.gameTitle.textContent = t('header.puzzle', { type: t(`puzzle.type.${puzzle.data.type}`) });
    els.gameBadges.innerHTML = `<span class="badge">${t('player.difficulty', { rating: puzzle.data.rating })}</span>`;
    return;
  }
  const tc = findTimeControl(mode === 'online' ? onlineInfo.tc?.id : tcId);
  const titles = {
    ai: t('header.ai', { level: aiLevel }),
    local: t('header.local'),
    online: t('header.online', { code: onlineInfo.code }),
  };
  els.gameTitle.textContent = titles[mode] ?? '';
  const badges = [`<span class="badge">${tc.id === 'none' ? `∞ ${t('tc.none')}` : `⏱ ${tc.short}`}</span>`];
  if (mode === 'online') {
    badges.push(onlineInfo.rated ? `<span class="badge accent">${t('badge.rated')}</span>` : `<span class="badge">${t('badge.casual')}</span>`);
  }
  if (mode === 'ai' && assisted) badges.push(`<span class="badge">${t('badge.assisted')}</span>`);
  els.gameBadges.innerHTML = badges.join('');
}

function renderChatBar() {
  els.chatBar.hidden = mode !== 'online' || opponentGone;
  els.chatBar.classList.toggle('disabled', !socketReady);
}

// `move`: nước vừa đi (để chạy hoạt ảnh); bỏ trống khi chỉ cập nhật lại hiển thị.
function render({ move = null } = {}) {
  if (mode === null) return;
  const total = game.moves.length;
  const ply = viewPly ?? total;
  const state = game.states[ply];
  const live = viewPly === null;
  const end = endInfo();
  lastEnd = end;
  const check = isInCheck(state.board, state.turn);
  const lastMove = ply > 0 ? game.moves[ply - 1] : null;
  const view = viewColor();
  const targets = new Set(live && selected !== null && settings.hints ? game.movesFrom(selected).map((m) => m.to) : []);
  const vm = {
    board: state.board,
    selected: live ? selected : null,
    targets,
    last: lastMove && { from: lastMove.from, to: lastMove.to },
    kingSquare: check ? state.board.indexOf(state.turn + 'K') : -1,
    hint: live ? hintMove : null,
    view,
    upright: !(mode === 'local' && settings.seating === 'rotate') || flipped,
    facing: mode === 'local' && settings.seating === 'facing' && !flipped,
  };

  if (use3D()) {
    let moved = null;
    if (move && live) {
      moved = { from: move.from, to: move.to, promo: Boolean(move.promo) };
      if (move.castle) {
        moved.rook = { from: move.to > move.from ? move.from + 3 : move.from - 4, to: (move.from + move.to) / 2 };
      }
    }
    board3d.update({ ...vm, moved, boardTheme: settings.board, pieceStyle: iconStyle() });
  } else {
    render2d(vm);
    if (move && live && view === lastView) animateMove2d(move);
  }
  lastView = view;

  barColors = { top: opponent(view), bottom: view };
  // Ngồi đối diện: thanh tên và đồng hồ phía trên cũng quay ngược cho người ngồi bên kia đọc.
  els.playerTop.classList.toggle('facing', vm.facing);
  renderPlayer(els.playerTop, barColors.top, end, ply);
  renderPlayer(els.playerBottom, barColors.bottom, end, ply);
  renderClocks();
  renderMoves(ply);
  renderHeader();
  renderOfferBar();
  renderToolbar(end);
  renderChatBar();
  els.status.textContent = statusText(end, live && check);
  els.reviewBanner.hidden = live;
  els.reviewText.textContent = t('review.text', { ply, total });

  if (end.over && !endHandled && mode !== 'puzzle') onGameEnd(end);
}

// ---------- Kết thúc ván: âm thanh, Elo luyện tập, EXP, hộp thoại kết quả ----------
function onGameEnd(end) {
  endHandled = true;
  const now = performance.now();
  if (clock && mode !== 'online') clock.stop(now);
  resultExtra = {};
  const outcome = describeEnd(end).outcome;

  if (mode === 'ai' || mode === 'local') writeJson(localStorage, SAVED_GAME_KEY, null);
  if (mode === 'ai') {
    const plies = game.moves.length;
    const result = outcome === 'win' ? 'win' : outcome === 'lose' ? 'loss' : 'draw';
    if (plies < 2) {
      resultExtra.note = t('result.tooShortPractice');
    } else if (assisted) {
      resultExtra.note = t('result.assistedPractice');
    } else {
      const before = loadBotRating();
      const after = updateBotRating(before, aiLevel, result === 'win' ? 1 : result === 'draw' ? 0.5 : 0);
      writeJson(localStorage, BOT_RATING_KEY, after);
      resultExtra.practice = { before: Math.round(before.rating), after: Math.round(after.rating) };
    }
    if (getUser()) reportBotGame(result, plies);
  }
  resultExtra.achievements = recordAchievements({
    type: 'game',
    mode,
    // Thắng máy nhờ gợi ý/hoàn tác không mở các thành tựu chiến thắng.
    outcome: mode === 'ai' && assisted && outcome === 'win' ? 'assisted' : outcome,
    reason: end.reason,
    moves: game.moves,
    me: mode === 'ai' ? humanColor : mode === 'online' ? myColor : null,
    level: aiLevel,
    rated: Boolean(lastOver?.rated),
    view3d: use3D(),
  });
  if (mode === 'online' && lastOver) {
    resultExtra.rating = lastOver.rating;
    resultExtra.xp = lastOver.xp;
    resultExtra.unrated = !lastOver.rated;
    refreshAccount();
  }

  setTimeout(() => playSound(outcome === 'lose' ? 'lose' : outcome === 'win' ? 'win' : 'draw'), 300);
  clearTimeout(resultTimer);
  // Chiếu hết có hoạt ảnh chibi thì chờ hoạt ảnh xong rồi mới mở hộp thoại kết quả.
  resultTimer = setTimeout(openResult, settings.checkFx && end.reason === 'checkmate' ? 2200 : 800);
}

async function reportBotGame(result, plies) {
  try {
    const res = await fetch('/api/progress/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: aiLevel, result, plies }),
    });
    if (!res.ok) return;
    resultExtra.xp = (await res.json()).xp;
    renderResultExtra();
    refreshAccount();
  } catch {
    // Không gửi được (mất mạng): bỏ qua, ván cờ vẫn kết thúc bình thường.
  }
}

function changeRow(label, before, after, suffix = '') {
  const diff = after - before;
  const sign = diff > 0 ? '+' : '';
  const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
  return `<div class="extra-row"><span>${label}</span><strong>${before} → ${after}${suffix} <em class="${cls}">${sign}${diff}</em></strong></div>`;
}

function renderResultExtra() {
  const parts = [];
  const r = resultExtra.rating;
  if (r) parts.push(changeRow(t('result.ratingPool', { pool: t(`pool.${r.pool}`) }), r.before, r.after, r.provisional ? '?' : ''));
  if (resultExtra.practice) parts.push(changeRow(t('result.practiceElo'), resultExtra.practice.before, resultExtra.practice.after));
  const xp = resultExtra.xp;
  if (xp) {
    const percent = xp.need ? Math.round((xp.into / xp.need) * 100) : 100;
    parts.push(
      `<div class="extra-row"><span>${t('result.xp')}</span><strong>+${xp.gained} EXP</strong></div>` +
        `<div class="xp-line"><span class="level-badge">${t('level.badge', { level: xp.level })}</span><span class="xp-bar"><span style="width:${percent}%"></span></span>` +
        `<span class="xp-num">${xp.need ? `${xp.into}/${xp.need}` : t('result.maxLevel')}</span></div>`,
    );
    if (xp.levelUp) parts.push(`<p class="extra-note highlight">🎉 ${t('result.levelUp', { level: xp.level })}</p>`);
    if (xp.gained === 0 && !xp.capped) parts.push(`<p class="extra-note">${t('result.tooShortXp')}</p>`);
    if (xp.capped) parts.push(`<p class="extra-note">${t('result.xpCapped')}</p>`);
  }
  for (const a of resultExtra.achievements ?? []) {
    parts.push(`<div class="extra-row achievement-row"><span>${a.icon} ${t('ach.new')} <b>${t(`ach.${a.id}.name`)}</b></span><strong>+${a.points}</strong></div>`);
  }
  if (resultExtra.note) parts.push(`<p class="extra-note">${resultExtra.note}</p>`);
  if (mode === 'online' && resultExtra.unrated) {
    parts.push(`<p class="extra-note">${t('result.casual')}</p>`);
  }
  if (mode !== 'local' && !getUser()) {
    parts.push(`<p class="extra-note">${t('result.loginHint')}</p>`);
  }
  els.resultExtra.innerHTML = parts.join('');
  els.resultExtra.hidden = parts.length === 0;
}

function openResult() {
  if (mode === null) return;
  const d = describeEnd(lastEnd);
  els.resultIcon.textContent = { win: '🏆', lose: '😞', draw: '🤝', info: '🏁' }[d.outcome];
  els.resultTitle.textContent = d.title;
  els.resultText.textContent = d.text;
  renderResultExtra();
  els.resultNew.hidden = mode === 'online';
  els.resultRematch.hidden = mode !== 'online' || opponentGone || !socketReady;
  if (!els.resultDialog.open) els.resultDialog.showModal();
}

// ---------- Âm thanh, thông báo ----------
function moveSound(m) {
  const check = isInCheck(game.state.board, game.turn);
  playSound(check ? 'check' : m.castle ? 'castle' : m.captured ? 'capture' : 'move');
  if (check) showCheckFx(m);
}

const CHECKER_ORDER = ['Q', 'R', 'B', 'N', 'P', 'K'];

// Chibi của quân đang chiếu: ưu tiên quân vừa đi, nếu chiếu mở thì lấy quân mạnh nhất đang chiếu.
function showCheckFx(m) {
  if (!settings.checkFx) return;
  const state = game.state;
  const king = state.board.indexOf(state.turn + 'K');
  const by = opponent(state.turn);
  const squares = attackers(state.board, king, by);
  if (!squares.length) return;
  const sq = squares.includes(m.to)
    ? m.to
    : squares.sort((a, b) => CHECKER_ORDER.indexOf(state.board[a][1]) - CHECKER_ORDER.indexOf(state.board[b][1]))[0];
  const mate = isCheckmate(state);
  playCheckFx($('#check-fx'), { type: state.board[sq][1], color: by, mate, text: t(mate ? 'fx.mate' : 'fx.check') });
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

// ---------- Đồng hồ ----------
function tick() {
  if (mode === null || els.screens.game.hidden) return;
  renderClocks();
  if (opponentAwayUntil && !lastEnd.over) els.status.textContent = statusText(lastEnd, false);
  // Chơi trên máy (với máy hoặc hai người): tự phát hiện hết giờ. Online thì máy chủ quyết định.
  if (mode !== 'online' && clock?.running && !lastEnd.over) {
    const color = clock.running;
    if (clock.remaining(color, performance.now()) <= 0) onFlag(color);
  }
}
setInterval(tick, 100);

function onFlag(color) {
  clock.stop(performance.now());
  clock.time[color] = 0;
  const winner = hasMatingMaterial(game.state.board, opponent(color)) ? opponent(color) : null;
  finished = { winner, reason: winner ? 'timeout' : 'timeout_draw' };
  aiRequestId++;
  aiThinking = false;
  selected = null;
  render();
}

// ---------- Tương tác trên bàn cờ ----------
function canMove() {
  if (viewPly !== null || aiThinking || awaitingServer || lastEnd.over) return false;
  if (mode === 'ai') return game.turn === humanColor;
  if (mode === 'online') return socketReady && game.turn === myColor;
  if (mode === 'puzzle') return puzzle.status !== 'solved' && puzzle.status !== 'reviewed' && game.turn === puzzle.playerColor;
  return mode === 'local';
}

function onSquare(i) {
  if (viewPly !== null) {
    toast(t('toast.reviewing'));
    return;
  }
  if (!canMove()) return;

  if (selected !== null) {
    const candidates = game.movesFrom(selected).filter((m) => m.to === i);
    if (candidates.length > 0) {
      const from = selected;
      if (candidates[0].promo) choosePromotion(candidates, (promo) => sendOrPlay(from, i, promo));
      else sendOrPlay(from, i, null);
      return;
    }
  }

  const piece = game.state.board[i];
  selected = piece && piece[0] === game.turn && i !== selected ? i : null;
  if (selected !== null) playSound('select');
  render();
}

function pieceMarkup(piece) {
  if (settings.pieces === 'glyph') return `<span class="chip-preview glyph">${GLYPH[piece[1]]}</span>`;
  if (settings.pieces === 'letters') return `<span class="chip-preview letters"><span>${piece[1]}</span></span>`;
  return `<span class="chip-preview svg">${pieceSvg(settings.pieces, piece)}</span>`;
}

function choosePromotion(candidates, onChoose) {
  els.promoChoices.innerHTML = '';
  for (const m of candidates) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'promo-btn';
    btn.innerHTML = `${pieceMarkup(m.piece[0] + m.promo)}<span>${pieceName(m.promo)}</span>`;
    btn.addEventListener('click', () => {
      els.promoDialog.close();
      onChoose(m.promo);
    });
    els.promoChoices.append(btn);
  }
  els.promoDialog.showModal();
}

// Sau mỗi nước đi trên máy (người hoặc máy đi): bấm đồng hồ, âm thanh, lưu ván, vẽ lại.
function afterLocalMove(m) {
  if (clock) clock.press(m.piece[0], performance.now());
  selected = null;
  hintMove = null;
  viewPly = null;
  moveSound(m);
  saveGame();
  render({ move: m });
}

function sendOrPlay(from, to, promo) {
  selected = null;
  if (mode === 'puzzle') return playPuzzleMove(from, to, promo);
  if (mode === 'online') {
    awaitingServer = true;
    send({ type: 'move', from, to, promo });
    render();
    return;
  }
  const m = game.play(from, to, promo);
  if (!m) return;
  afterLocalMove(m);
  if (mode === 'ai' && !lastEnd.over && game.turn !== humanColor) askAI();
}

// ---------- Máy ----------
function askAI() {
  aiThinking = true;
  const aiColor = opponent(humanColor);
  // Có đồng hồ thì máy chia thời gian: khoảng 1/30 thời gian còn lại, cộng phần lớn giây thưởng.
  const timeMs = clock ? Math.max(200, clock.remaining(aiColor, performance.now()) / 30 + clock.inc * 0.8) : undefined;
  aiWorker.postMessage({ id: ++aiRequestId, level: aiLevel, state: game.state, timeMs });
  render();
}

function askHint() {
  if (mode !== 'ai' || !canMove()) return;
  hintRequest = `h${++hintCounter}`;
  assisted = true;
  aiWorker.postMessage({ id: hintRequest, level: 10, state: game.state, timeMs: 1500 });
  saveGame();
  render();
}

aiWorker.onmessage = ({ data }) => {
  if (data.id === hintRequest) {
    hintRequest = null;
    if (data.move && canMove()) hintMove = { from: data.move.from, to: data.move.to };
    render();
    return;
  }
  if (data.id !== aiRequestId || mode !== 'ai') return;
  aiThinking = false;
  if (lastEnd.over) return render();
  const m = data.move ? game.play(data.move.from, data.move.to, data.move.promo) : null;
  if (m) afterLocalMove(m);
  else render();
};

function undoMove() {
  if (aiThinking || game.moves.length === 0 || clock) return;
  clearTimeout(resultTimer);
  if (els.resultDialog.open) els.resultDialog.close();
  finished = null;
  endHandled = false;
  selected = null;
  hintMove = null;
  viewPly = null;
  game.undo();
  // Đấu với máy: hoàn tác cả nước của máy để quay lại lượt người chơi.
  if (mode === 'ai') {
    assisted = true;
    if (game.turn !== humanColor && game.moves.length > 0) game.undo();
  }
  saveGame();
  render();
  if (mode === 'ai' && game.turn !== humanColor && !lastEnd.over) askAI();
}

// ---------- Xem lại ván ----------
function goToPly(ply) {
  const total = game.moves.length;
  viewPly = ply >= total ? null : Math.max(0, ply);
  selected = null;
  render();
}

// ---------- Lưu và tiếp tục ván (chơi với máy, hai người) ----------
function saveGame() {
  if (mode !== 'ai' && mode !== 'local') return;
  if (lastEnd.over && endHandled) return;
  writeJson(localStorage, SAVED_GAME_KEY, {
    mode,
    humanColor,
    aiLevel,
    tcId,
    assisted,
    moves: game.moves.map((m) => [m.from, m.to, m.promo]),
    clock: clock ? clock.snapshot(performance.now()) : null,
    savedAt: Date.now(),
  });
}

function timeAgo(ms) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { n: minutes });
  const hours = Math.round(minutes / 60);
  return hours < 24 ? t('time.hoursAgo', { n: hours }) : t('time.daysAgo', { n: Math.round(hours / 24) });
}

function updateResumeCard() {
  const saved = readJson(localStorage, SAVED_GAME_KEY, null);
  const valid = saved && Array.isArray(saved.moves) && saved.moves.length > 0;
  els.resumeCard.hidden = !valid;
  if (!valid) return;
  const what = saved.mode === 'ai' ? t('header.ai', { level: saved.aiLevel }) : t('header.local');
  const tc = findTimeControl(saved.tcId);
  els.resumeDesc.textContent = t('resume.desc', { what, moves: saved.moves.length, tc: tc.id === 'none' ? t('tc.none') : tc.short, ago: timeAgo(saved.savedAt) });
}

function resumeGame() {
  const saved = readJson(localStorage, SAVED_GAME_KEY, null);
  if (!saved) return;
  humanColor = saved.humanColor === 'b' ? 'b' : 'w';
  aiLevel = Math.min(12, Math.max(1, Number(saved.aiLevel) || 5));
  startGame(saved.mode === 'ai' ? 'ai' : 'local', { tc: saved.tcId, moves: saved.moves, clockState: saved.clock, assisted: saved.assisted });
}

// ---------- Bắt đầu và kết thúc ván ----------
function show(screen) {
  for (const [name, el] of Object.entries(els.screens)) el.hidden = name !== screen;
  if (screen === 'game') applyView();
  if (screen === 'menu') {
    updateResumeCard();
    updatePuzzleCard();
  }
  if (screen === 'ai') renderPracticeBox();
  if (screen === 'online') updateRatedHint();
  if (screen === 'about') renderPieceCards();
  window.scrollTo(0, 0);
}

function resetState() {
  selected = null;
  hintMove = null;
  viewPly = null;
  flipped = false;
  finished = null;
  lastEnd = { over: false };
  endHandled = false;
  resultExtra = {};
  aiThinking = false;
  awaitingServer = false;
  hintRequest = null;
  puzzle = null;
  puzzleRatingChange = null;
  offer = null;
  lastOver = null;
  opponentAwayUntil = 0;
  opponentGone = false;
  lastView = null;
  clearTimeout(resultTimer);
  aiRequestId++;
  if (els.resultDialog.open) els.resultDialog.close();
}

function startGame(nextMode, { tc = 'none', moves = [], clockState = null, assisted: wasAssisted = false } = {}) {
  resetState();
  mode = nextMode;
  tcId = findTimeControl(tc).id;
  assisted = wasAssisted;
  game = new Game();
  for (const [from, to, promo] of moves) {
    if (!game.play(from, to, promo)) break;
  }
  const t = findTimeControl(tcId);
  clock = t.base ? new Clock(t.base * 1000, t.inc * 1000) : null;
  if (clock && clockState) {
    clock.time = { w: clockState.w, b: clockState.b };
    if (clockState.running) {
      clock.running = clockState.running;
      clock.since = performance.now();
    }
  }
  show('game');
  render();
  playSound('start');
  saveGame();
  if (mode === 'ai' && game.turn !== humanColor && !lastEnd.over) askAI();
}

function startAI() {
  const choice = els.aiColor.querySelector('[aria-checked="true"]').dataset.value;
  prefs.aiColor = choice;
  prefs.aiLevel = Number(els.aiLevel.value);
  savePrefs();
  humanColor = choice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
  aiLevel = prefs.aiLevel;
  startGame('ai', { tc: prefs.aiTc });
}

function restartGame() {
  if (mode === 'ai') startGame('ai', { tc: tcId });
  else if (mode === 'local') startGame('local', { tc: tcId });
}

function goHome() {
  if (mode === 'ai' || mode === 'local') saveGame();
  stopSeekUi();
  if (socket) send({ type: 'leave' });
  writeJson(sessionStorage, ROOM_KEY, null);
  closeSocket();
  resetState();
  mode = null;
  clock = null;
  show('menu');
}

// ---------- Elo luyện tập ----------
function renderPracticeBox() {
  const practice = loadBotRating();
  const suggestion = suggestedBotLevel(practice.rating);
  els.practiceBox.innerHTML =
    `<div><span class="label">${t('practice.title')}</span><strong>${Math.round(practice.rating)}</strong>` +
    `<span class="hint">${t('practice.games', { n: practice.games })}</span></div>` +
    `<button type="button" class="btn small" id="use-suggested">${t('practice.suggest', { level: suggestion })}</button>`;
  $('#use-suggested').addEventListener('click', () => {
    els.aiLevel.value = suggestion;
    updateLevelText();
  });
}

const LEVEL_DESC = [
  [3, 'levelDesc.1'],
  [6, 'levelDesc.2'],
  [9, 'levelDesc.3'],
  [12, 'levelDesc.4'],
];

function updateLevelText() {
  const level = LEVELS[Number(els.aiLevel.value) - 1];
  els.levelText.textContent = `${level.level} – ${t(`level.${level.level}`)}`;
  els.levelDesc.textContent = `${t(LEVEL_DESC.find(([max]) => level.level <= max)[1])} ${t('ai.internalElo', { elo: botElo(level.level) })}`;
}

// ---------- Chơi online ----------
function send(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function closeSocket() {
  clearTimeout(reconnectTimer);
  reconnectAttempts = 0;
  if (socket) {
    const old = socket;
    socket = null;
    old.close();
  }
  socketReady = false;
}

function connect(onOpen) {
  if (socket) {
    const old = socket;
    socket = null;
    old.close();
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = ws;
  ws.onopen = () => {
    socketReady = true;
    onOpen();
  };
  ws.onmessage = (e) => handleServer(JSON.parse(e.data));
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    socketReady = false;
    if (roomSession()) {
      scheduleReconnect();
    } else {
      els.onlineMsg.textContent = t('online.lost');
    }
    render();
  };
}

// Mất kết nối: thử nối lại với thời gian chờ tăng dần, rồi xin máy chủ trả lại phòng.
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  if (reconnectAttempts >= 8) {
    writeJson(sessionStorage, ROOM_KEY, null);
    if (mode === 'online' && !lastEnd.over) finished = { winner: null, reason: 'disconnect' };
    els.onlineMsg.textContent = t('online.reconnectFailed');
    render();
    return;
  }
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 15000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(rejoinRoom, delay);
}

function rejoinRoom() {
  const saved = roomSession();
  if (!saved) return;
  connect(() => send({ type: 'rejoin', code: saved.code, token: saved.token }));
}

function syncClock(snapshot) {
  if (!snapshot) {
    clock = null;
    return;
  }
  clock ??= new Clock(0, 0);
  clock.time = { w: snapshot.w, b: snapshot.b };
  clock.running = snapshot.running;
  clock.since = performance.now();
}

function startOnline(msg, moves = []) {
  resetState();
  mode = 'online';
  myColor = msg.color;
  onlineInfo = { names: msg.names ?? {}, ratings: msg.ratings ?? {}, rated: Boolean(msg.rated), tc: msg.tc, code: msg.code };
  writeJson(sessionStorage, ROOM_KEY, { code: msg.code, token: msg.token });
  reconnectAttempts = 0;
  game = new Game();
  for (const m of moves) game.play(m.from, m.to, m.promo);
  clock = null;
  syncClock(msg.clock);
  show('game');
  render();
}

function showChatBubble(color, id) {
  const bar = barColors.top === color ? els.playerTop : els.playerBottom;
  const bubble = bar.querySelector('.pbubble');
  bubble.textContent = id >= 0 && id < CHAT_PHRASES.length ? t(`chat.${id}`) : '';
  bubble.hidden = false;
  clearTimeout(bubbleTimers[color]);
  bubbleTimers[color] = setTimeout(() => {
    bubble.hidden = true;
  }, 3500);
}

function handleServer(msg) {
  switch (msg.type) {
    case 'seeking':
      startSeekUi(msg);
      break;
    case 'seek_cancelled':
      stopSeekUi();
      closeSocket();
      break;
    case 'room': {
      onlineInfo = { ...onlineInfo, code: msg.code, tc: msg.tc, rated: msg.rated };
      writeJson(sessionStorage, ROOM_KEY, { code: msg.code, token: msg.token });
      reconnectAttempts = 0;
      els.roomCodeText.textContent = msg.code;
      els.roomInfo.textContent = `${t(`tc.${msg.tc.id}`)} · ${msg.rated ? t('online.roomRated') : t('online.roomCasual')}`;
      els.roomBox.hidden = false;
      els.onlineMsg.textContent = '';
      if (mode === null) show('online');
      break;
    }
    case 'start':
      stopSeekUi();
      startOnline(msg);
      playSound('start');
      break;
    case 'state':
      startOnline(msg, msg.moves);
      if (msg.status === 'over' && msg.result) {
        finished = { winner: msg.result.winner, reason: msg.result.reason };
        endHandled = true; // đã xử lý kết thúc trước khi mất kết nối
      }
      offer = msg.drawOffer === 'received' ? 'draw_received' : msg.drawOffer === 'sent' ? 'draw_sent' : null;
      opponentAwayUntil = msg.opponentConnected ? 0 : Date.now() + 60000;
      render();
      toast(t('online.rejoined'));
      break;
    case 'move': {
      awaitingServer = false;
      if (offer === 'draw_received' || offer === 'draw_sent') offer = null;
      const m = game.play(msg.from, msg.to, msg.promo);
      syncClock(msg.clock);
      if (m) {
        selected = null;
        viewPly = null;
        moveSound(m);
        render({ move: m });
      } else {
        showError(t('online.desync'));
        render();
      }
      break;
    }
    case 'over':
      awaitingServer = false;
      offer = null;
      lastOver = msg;
      syncClock(msg.clock);
      finished = { winner: msg.winner, reason: msg.reason };
      render();
      break;
    case 'draw_offer':
      offer = 'draw_received';
      playSound('select');
      render();
      break;
    case 'draw_declined':
      offer = null;
      toast(t('online.drawDeclined'));
      render();
      break;
    case 'rematch_offer':
      offer = 'rematch_received';
      playSound('select');
      render();
      if (els.resultDialog.open) toast(t('online.rematchWanted'));
      break;
    case 'opponent_disconnected':
      opponentAwayUntil = Date.now() + msg.seconds * 1000;
      render();
      break;
    case 'opponent_reconnected':
      opponentAwayUntil = 0;
      toast(t('online.opponentBack'));
      render();
      break;
    case 'opponent_left':
      opponentGone = true;
      if (offer?.startsWith('rematch')) offer = null;
      if (els.resultDialog.open) els.resultRematch.hidden = true;
      toast(t('online.opponentLeft'));
      render();
      break;
    case 'chat':
      showChatBubble(msg.from, msg.id);
      break;
    case 'rejoin_failed':
      writeJson(sessionStorage, ROOM_KEY, null);
      closeSocket();
      if (mode === 'online') {
        if (!lastEnd.over) finished = { winner: null, reason: 'disconnect' };
        render();
      } else {
        els.onlineMsg.textContent = t('online.roomGone');
      }
      break;
    case 'error':
      awaitingServer = false;
      showError(serverText(msg));
      render();
      break;
  }
}

// Thông báo từ máy chủ: dịch theo mã lỗi nếu có, nếu không thì dùng nguyên văn.
function serverText(msg) {
  const k = `err.${msg.code}`;
  return msg.code && t(k) !== k ? t(k) : msg.message;
}

function showError(text) {
  els.onlineMsg.textContent = text;
  if (mode === 'online') toast(text);
  playSound('error');
}

function roomLink() {
  return `${location.origin}${location.pathname}?room=${onlineInfo.code}`;
}

function updateRatedHint() {
  els.onlineRated.checked = prefs.onlineRated;
  els.ratedHint.textContent = getUser()
    ? t('online.ratedHintUser')
    : t('online.ratedHintGuest');
}

function createRoom() {
  els.roomBox.hidden = true;
  els.onlineMsg.textContent = t('online.creating');
  connect(() => send({ type: 'create', tc: prefs.onlineTc, rated: prefs.onlineRated }));
}

function joinRoom() {
  const code = els.roomCode.value.trim().toUpperCase();
  if (!code) {
    els.onlineMsg.textContent = t('online.enterCode');
    return;
  }
  els.onlineMsg.textContent = t('online.joining');
  connect(() => send({ type: 'join', code }));
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    window.prompt(t('copy.prompt'), text);
  }
}

// ---------- Bảng xếp hạng ----------
let leaderboardPool = 'blitz';

async function openLeaderboard() {
  if (!els.leaderboardDialog.open) els.leaderboardDialog.showModal();
  const list = $('#lb-list');
  $('#lb-pools')
    .querySelectorAll('[role="radio"]')
    .forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === leaderboardPool)));
  list.innerHTML = `<li class="lb-empty">${t('common.loading')}</li>`;
  try {
    const res = await fetch(`/api/leaderboard?pool=${leaderboardPool}`);
    const { players } = await res.json();
    if (!players.length) {
      list.innerHTML = `<li class="lb-empty">${t('lb.empty')}</li>`;
      return;
    }
    list.replaceChildren(
      ...players.map((p, i) => {
        const li = document.createElement('li');
        li.className = i < 3 ? `top top${i + 1}` : '';
        const rank = document.createElement('span');
        rank.className = 'lb-rank';
        rank.textContent = i + 1;
        const name = document.createElement('span');
        name.className = 'lb-name';
        name.textContent = p.name;
        const games = document.createElement('span');
        games.className = 'lb-games';
        games.textContent = t('lb.games', { n: p.games });
        const rating = document.createElement('strong');
        rating.className = 'lb-rating';
        rating.textContent = `${p.rating}${p.provisional ? '?' : ''}`;
        li.append(rank, name, games, rating);
        return li;
      }),
    );
  } catch {
    list.innerHTML = `<li class="lb-empty">${t('lb.error')}</li>`;
  }
}

(function buildPoolTabs() {
  const container = $('#lb-pools');
  for (const pool of Object.keys(POOLS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.dataset.value = pool;
    btn.dataset.i18n = `pool.${pool}`;
    btn.textContent = t(`pool.${pool}`);
    btn.addEventListener('click', () => {
      leaderboardPool = pool;
      openLeaderboard();
    });
    container.append(btn);
  }
})();


// ---------- Giải đố chiếu hết ----------
const PUZZLE_KEY = 'co-vua-puzzle'; // Puzzle Rating của khách (người có tài khoản lưu trên máy chủ)

function puzzleProgress() {
  const user = getUser();
  if (user?.puzzle) return { ...DEFAULT_PUZZLE_RATING, ...user.puzzle };
  return { ...DEFAULT_PUZZLE_RATING, ...readJson(localStorage, PUZZLE_KEY, {}) };
}

function updatePuzzleCard() {
  const progress = puzzleProgress();
  $('#puzzle-desc').textContent = progress.games
    ? t('puzzle.cardProgress', { rating: Math.round(progress.rating), solved: progress.solved, games: progress.games })
    : t('ui.chieu_het_trong_1_hoac');
}

async function startPuzzle() {
  try {
    puzzleList ??= await (await fetch('data/puzzles.json')).json();
  } catch {
    toast(t('puzzle.loadError'));
    return;
  }
  const recent = readJson(localStorage, 'co-vua-puzzle-recent', []);
  const data = pickPuzzle(puzzleList, puzzleProgress().rating, recent);
  writeJson(localStorage, 'co-vua-puzzle-recent', [data.id, ...recent].slice(0, Math.floor(puzzleList.length * 0.7)));
  resetState();
  mode = 'puzzle';
  tcId = 'none';
  clock = null;
  game = new Game(data.fen);
  puzzle = { data, playerColor: game.turn, status: 'playing', reported: false };
  show('game');
  render();
  playSound('start');
}

function puzzleStatusText() {
  const who = colorName(puzzle.playerColor);
  const change = puzzleRatingChange
    ? ` Puzzle Rating ${puzzleRatingChange.before} → ${puzzleRatingChange.after} (${puzzleRatingChange.after >= puzzleRatingChange.before ? '+' : ''}${puzzleRatingChange.after - puzzleRatingChange.before})`
    : '';
  if (puzzle.status === 'solved') return `${t('puzzle.solved')}${change}`;
  if (puzzle.status === 'reviewed') return `${t('puzzle.reviewed')}${change}`;
  if (aiThinking) return t('puzzle.defending');
  if (puzzle.status === 'failed') return `${t('puzzle.failed')}${change}`;
  return t(`puzzle.task.${puzzle.data.type}`, { color: who });
}

// Nước đúng tiếp theo theo lời giải lưu sẵn (dùng để gợi ý khi đi sai).
function expectedPuzzleMove() {
  const uci = puzzle.data.line[game.moves.length];
  const m = uci && legalMoves(game.state).find((x) => toUci(x) === uci);
  if (m) return m;
  return mateMoves(game.state)[0] ?? legalMoves(game.state).find((x) => forcesMateIn2(game.state, x)) ?? null;
}

// Nước chống đỡ khó nhất: nước làm bên giải có ít cách chiếu hết nhất.
function strongestDefense(state) {
  let best = null;
  let fewest = Infinity;
  for (const r of legalMoves(state)) {
    const count = mateMoves(applyMove(state, r)).length;
    if (count < fewest) {
      fewest = count;
      best = r;
    }
  }
  return best;
}

function playPuzzleMove(from, to, promo) {
  const before = game.state;
  const m = game.play(from, to, promo);
  if (!m) return;
  hintMove = null;
  moveSound(m);
  const ply = game.moves.length - 1;
  // Chấp nhận mọi nước đúng, không chỉ đúng đường giải lưu sẵn (có thể có nhiều cách chiếu hết).
  const needsMateNow = puzzle.data.type === 'mate1' || ply === 2;
  const correct = needsMateNow ? isCheckmate(game.state) : forcesMateIn2(before, m);
  render({ move: m });

  if (!correct) {
    reportPuzzle(false);
    puzzle.status = 'failed';
    playSound('error');
    setTimeout(() => {
      if (mode !== 'puzzle') return;
      game.undo();
      const hint = expectedPuzzleMove();
      hintMove = hint && { from: hint.from, to: hint.to };
      render();
    }, 700);
    return;
  }
  if (isCheckmate(game.state)) {
    const wasFailed = puzzle.status === 'failed';
    puzzle.status = wasFailed ? 'reviewed' : 'solved';
    if (!wasFailed) reportPuzzle(true);
    setTimeout(() => playSound(wasFailed ? 'draw' : 'win'), 250);
    render();
    return;
  }
  // Còn một nước nữa: đối phương chống đỡ.
  aiThinking = true;
  render();
  setTimeout(() => {
    if (mode !== 'puzzle') return;
    aiThinking = false;
    const planned = toUci(m) === puzzle.data.line[0] && legalMoves(game.state).find((x) => toUci(x) === puzzle.data.line[1]);
    const reply = planned || strongestDefense(game.state);
    const played = game.play(reply.from, reply.to, reply.promo);
    moveSound(played);
    if (puzzle.status === 'failed') {
      const hint = expectedPuzzleMove();
      hintMove = hint && { from: hint.from, to: hint.to };
    }
    render({ move: played });
  }, 500);
}

function showPuzzleHint() {
  if (mode !== 'puzzle' || puzzle.status !== 'playing') return;
  reportPuzzle(false); // xem gợi ý coi như chưa giải được
  puzzle.status = 'failed';
  const hint = expectedPuzzleMove();
  hintMove = hint && { from: hint.from, to: hint.to };
  render();
}

// Ghi kết quả một lần cho mỗi bài: khách tính trên máy, người có tài khoản do máy chủ tính.
async function reportPuzzle(solved) {
  if (puzzle.reported) return;
  puzzle.reported = true;
  const before = puzzleProgress();
  let after;
  if (getUser()) {
    try {
      const res = await fetch('/api/progress/puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: puzzle.data.id, solved }),
      });
      if (!res.ok) throw new Error('lỗi máy chủ');
      after = (await res.json()).puzzle;
      await refreshAccount();
    } catch {
      after = null;
    }
  }
  if (!after) {
    after = updatePuzzleRating(before, puzzle.data.rating, solved);
    if (!getUser()) writeJson(localStorage, PUZZLE_KEY, after);
  }
  if (mode !== 'puzzle') return;
  puzzleRatingChange = { before: Math.round(before.rating), after: Math.round(after.rating) };
  const fresh = recordAchievements({ type: 'puzzle', solved, streak: after.streak, rating: after.rating, totalSolved: after.solved });
  fresh.forEach((a, i) => setTimeout(() => toast(`${a.icon} ${t('ach.new')} ${t(`ach.${a.id}.name`)} (+${a.points})`), 600 + i * 2800));
  render();
}

// ---------- Thành tựu ----------
const ACH_KEY = 'co-vua-achievements';
const achievementProgress = () => ({ unlocked: {}, counters: {}, ...readJson(localStorage, ACH_KEY, {}) });

function recordAchievements(event) {
  const progress = achievementProgress();
  const fresh = evaluateAchievements(progress, event);
  writeJson(localStorage, ACH_KEY, progress);
  if (fresh.length && getUser()) syncAchievements();
  return fresh;
}

// Đồng bộ với tài khoản: hợp nhất hai phía, giữ thời điểm mở khóa sớm nhất.
async function syncAchievements() {
  const progress = achievementProgress();
  const remote = getUser()?.achievements ?? {};
  for (const [id, at] of Object.entries(remote)) {
    if (!progress.unlocked[id] || at < progress.unlocked[id]) progress.unlocked[id] = at;
  }
  writeJson(localStorage, ACH_KEY, progress);
  try {
    await fetch('/api/achievements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unlocked: progress.unlocked }),
    });
  } catch {
    // Mất mạng: lần sau đồng bộ lại.
  }
}

function openAchievements() {
  const { unlocked, counters } = achievementProgress();
  const total = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  $('#ach-summary').textContent = t('ach.summary', { count, all: ACHIEVEMENTS.length, points: achievementPoints(unlocked), total });
  const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
  const list = $('#ach-list');
  list.replaceChildren();
  for (const group of groups) {
    const title = document.createElement('h3');
    title.className = 'ach-group';
    title.textContent = t(`ach.group.${group}`);
    list.append(title);
    for (const a of ACHIEVEMENTS.filter((x) => x.group === group)) {
      const done = Boolean(unlocked[a.id]);
      const secret = a.hidden && !done;
      const item = document.createElement('div');
      item.className = `ach${done ? ' done' : ''}`;
      const progressText = a.goal && !done ? ` (${Math.min(counters[a.goal.key] ?? 0, a.goal.value)}/${a.goal.value})` : '';
      item.innerHTML =
        `<span class="ach-icon">${secret ? '❔' : a.icon}</span>` +
        `<span class="ach-text"><strong></strong><span></span></span><span class="ach-points">${a.points}</span>`;
      item.querySelector('strong').textContent = secret ? t('ach.hidden') : t(`ach.${a.id}.name`);
      item.querySelector('.ach-text span').textContent = secret ? t('ach.hiddenDesc') : t(`ach.${a.id}.desc`) + progressText;
      list.append(item);
    }
  }
  if (!els.achievementsDialog.open) els.achievementsDialog.showModal();
}

// ---------- Ghép trận ngẫu nhiên ----------
function seekOpponent() {
  els.roomBox.hidden = true;
  els.onlineMsg.textContent = t('online.connecting');
  connect(() => send({ type: 'seek', tc: prefs.onlineTc }));
}

function startSeekUi(msg) {
  els.onlineMsg.textContent = '';
  els.seekBox.hidden = false;
  seekStarted = Date.now();
  const update = () => {
    const seconds = Math.floor((Date.now() - seekStarted) / 1000);
    els.seekText.textContent = t('seek.text', { tc: msg.tc.short, rating: msg.rating, time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` });
  };
  update();
  clearInterval(seekTimer);
  seekTimer = setInterval(update, 1000);
}

function stopSeekUi() {
  clearInterval(seekTimer);
  els.seekBox.hidden = true;
}


// ---------- Ngôn ngữ ----------
function updateLangButtons() {
  const lang = LANGUAGES.find((l) => l.code === getLanguage()) ?? LANGUAGES[0];
  $('#btn-lang').innerHTML = flagSvg(lang.code);
  $('#open-lang').innerHTML = `${flagSvg(lang.code)}<span></span>`;
  $('#open-lang span').textContent = lang.name;
}

function openLanguages() {
  const list = $('#lang-list');
  list.replaceChildren(
    ...LANGUAGES.map((lang) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lang-item';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(lang.code === getLanguage()));
      btn.lang = lang.code;
      btn.innerHTML = `${flagSvg(lang.code)}<span></span>`;
      btn.querySelector('span').textContent = lang.name;
      btn.addEventListener('click', async () => {
        try {
          await setLanguage(lang.code);
        } catch {
          toast(t('lang.loadError'));
          return;
        }
        rebuildTexts();
        $('#lang-dialog').close();
      });
      return btn;
    }),
  );
  if (!$('#lang-dialog').open) $('#lang-dialog').showModal();
}

// Vẽ lại các phần chữ được tạo bằng mã (phần có data-i18n đã được dịch tự động).
function rebuildTexts() {
  buildChoices('pieces', $('#opt-pieces'), true);
  buildChoices('board', $('#opt-board'), true);
  buildChoices('view', $('#opt-view'), false);
  buildChoices('theme', $('#opt-theme'), false);
  buildChoices('seating', $('#opt-seating'), false);
  buildChoices('seating', $('#local-seating'), false);
  buildTcChips($('#ai-tc'), 'aiTc');
  buildTcChips($('#local-tc'), 'localTc');
  buildTcChips($('#online-tc'), 'onlineTc');
  applySettings();
  updateLangButtons();
  updateLevelText();
  renderPracticeBox();
  updateRatedHint();
  updatePuzzleCard();
  updateResumeCard();
  rerenderAccount();
  if (!els.screens.about.hidden) renderPieceCards();
  if (els.leaderboardDialog.open) openLeaderboard();
  if (els.achievementsDialog.open) openAchievements();
  if (els.resultDialog.open) openResult();
  render();
}

// ---------- Trang luật cờ: sơ đồ nước đi của từng quân ----------
// Mỗi sơ đồ là bàn 7×7, quân ở giữa (riêng Tốt đứng gần dưới); chấm = ô đi được, vòng = ô ăn quân.
function moveDiagram(type) {
  const size = 7;
  const center = type === 'P' ? [5, 3] : [3, 3];
  const marks = new Map();
  const add = (r, c, kind = 'dot') => {
    if (r >= 0 && r < size && c >= 0 && c < size && !(r === center[0] && c === center[1])) marks.set(`${r},${c}`, kind);
  };
  const ray = (dr, dc) => {
    for (let k = 1; k < size; k++) add(center[0] + dr * k, center[1] + dc * k);
  };
  const [r0, c0] = center;
  if (type === 'K') for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) add(r0 + dr, c0 + dc);
  if (type === 'R' || type === 'Q') for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ray(dr, dc);
  if (type === 'B' || type === 'Q') for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) ray(dr, dc);
  if (type === 'N') for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) add(r0 + dr, c0 + dc);
  if (type === 'P') {
    add(r0 - 1, c0);
    add(r0 - 2, c0);
    add(r0 - 1, c0 - 1, 'ring');
    add(r0 - 1, c0 + 1, 'ring');
  }
  const cell = 14;
  let svg = `<svg viewBox="0 0 ${size * cell} ${size * cell}" class="move-diagram" aria-hidden="true">`;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      svg += `<rect x="${c * cell}" y="${r * cell}" width="${cell}" height="${cell}" fill="${(r + c) % 2 ? 'var(--dark-sq)' : 'var(--light-sq)'}"/>`;
      const kind = marks.get(`${r},${c}`);
      const cx = c * cell + cell / 2;
      const cy = r * cell + cell / 2;
      if (kind === 'dot') svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="rgba(0,0,0,0.42)"/>`;
      if (kind === 'ring') svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="none" stroke="#e5484d" stroke-width="2"/>`;
    }
  }
  return `${svg}</svg>`;
}

function renderPieceCards() {
  const container = $('#piece-cards');
  container.replaceChildren(
    ...['K', 'Q', 'R', 'B', 'N', 'P'].map((type) => {
      const card = document.createElement('div');
      card.className = 'piece-card';
      card.innerHTML =
        `<div class="piece-card-head"><span class="piece-icon">${pieceSvg(iconStyle(), `w${type}`)}</span><strong></strong></div>` +
        `<div class="diagram-wrap">${moveDiagram(type)}<span class="diagram-piece">${pieceSvg(iconStyle(), `w${type}`)}</span></div><p></p>`;
      card.querySelector('strong').textContent = pieceName(type);
      card.querySelector('p').textContent = t(`rules.move.${type}`);
      const [r, c] = type === 'P' ? [5, 3] : [3, 3];
      const piece = card.querySelector('.diagram-piece');
      piece.style.left = `${(c / 7) * 100}%`;
      piece.style.top = `${(r / 7) * 100}%`;
      return card;
    }),
  );
}

// ---------- Gắn sự kiện ----------
els.board.addEventListener('click', (e) => {
  const sq = e.target.closest('.sq');
  if (sq) onSquare(Number(sq.dataset.i));
});

$('#btn-ai').addEventListener('click', () => show('ai'));
$('#btn-local').addEventListener('click', () => show('local'));
$('#btn-lang').addEventListener('click', openLanguages);
$('#open-lang').addEventListener('click', () => {
  els.settingsDialog.close();
  openLanguages();
});
$('#lang-close').addEventListener('click', () => $('#lang-dialog').close());
$('#lang-dialog').addEventListener('click', (e) => {
  if (e.target === $('#lang-dialog')) $('#lang-dialog').close();
});
$('#menu-about').addEventListener('click', () => show('about'));
$('#about-play').addEventListener('click', () => show('ai'));
$('#btn-puzzle').addEventListener('click', startPuzzle);
$('#tool-next').addEventListener('click', startPuzzle);
$('#menu-achievements').addEventListener('click', openAchievements);
$('#achievements-close').addEventListener('click', () => els.achievementsDialog.close());
els.achievementsDialog.addEventListener('click', (e) => {
  if (e.target === els.achievementsDialog) els.achievementsDialog.close();
});
$('#seek-opponent').addEventListener('click', seekOpponent);
$('#seek-cancel').addEventListener('click', () => send({ type: 'cancel_seek' }));
$('#btn-online').addEventListener('click', () => {
  els.onlineMsg.textContent = '';
  els.roomBox.hidden = true;
  show('online');
});
$('#ai-start').addEventListener('click', startAI);
$('#local-start').addEventListener('click', () => startGame('local', { tc: prefs.localTc }));
els.onlineRated.addEventListener('change', (e) => {
  prefs.onlineRated = e.target.checked;
  savePrefs();
});
$('#create-room').addEventListener('click', createRoom);
$('#join-room').addEventListener('click', joinRoom);
els.roomCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});
$('#copy-room').addEventListener('click', () => copyText(roomLink(), t('toast.roomLinkCopied')));
const shareButton = $('#share-room');
shareButton.hidden = !navigator.share;
shareButton.addEventListener('click', () => {
  navigator.share({ title: t('ui.co_vua'), text: t('share.text', { code: onlineInfo.code }), url: roomLink() }).catch(() => {});
});

els.resumeCard.addEventListener('click', (e) => {
  if (e.target.closest('#resume-discard')) return;
  resumeGame();
});
$('#resume-discard').addEventListener('click', (e) => {
  e.stopPropagation();
  writeJson(localStorage, SAVED_GAME_KEY, null);
  updateResumeCard();
  toast(t('toast.savedDiscarded'));
});

// Về menu: đang giữa ván online thì hỏi lại, vì rời phòng sẽ bị xử thua.
function requestHome() {
  const playingOnline = mode === 'online' && !lastEnd.over;
  if (playingOnline && !window.confirm(t('confirm.leaveOnline'))) return;
  goHome();
}
document.querySelectorAll('[data-home]').forEach((btn) => btn.addEventListener('click', requestHome));

// Thanh công cụ
$('#tool-hint').addEventListener('click', () => (mode === 'puzzle' ? showPuzzleHint() : askHint()));
$('#tool-undo').addEventListener('click', undoMove);
$('#tool-draw').addEventListener('click', () => {
  send({ type: 'draw_offer' });
  if (offer !== 'draw_received') offer = 'draw_sent';
  render();
});
$('#tool-resign').addEventListener('click', () => {
  if (!window.confirm(t('confirm.resign'))) return;
  if (mode === 'online') {
    send({ type: 'resign' });
    return;
  }
  aiRequestId++;
  aiThinking = false;
  finished = { winner: opponent(humanColor), reason: 'resign' };
  render();
});
$('#tool-rematch').addEventListener('click', requestRematch);
$('#tool-new').addEventListener('click', () => {
  if (game.moves.length > 0 && !lastEnd.over && !window.confirm(t('confirm.newGame'))) return;
  restartGame();
});
$('#tool-flip').addEventListener('click', () => {
  flipped = !flipped;
  render();
});
$('#tool-cam').addEventListener('click', () => board3d?.resetCamera());
$('#tool-pgn').addEventListener('click', () => copyText(game.pgn(), t('toast.pgnCopied')));
$('#tool-home').addEventListener('click', requestHome);

function requestRematch() {
  send({ type: 'rematch' });
  if (offer !== 'rematch_received') offer = 'rematch_sent';
  if (els.resultDialog.open) els.resultDialog.close();
  render();
}

els.offerAccept.addEventListener('click', () => {
  if (offer === 'draw_received') send({ type: 'draw_accept' });
  if (offer === 'rematch_received') send({ type: 'rematch' });
  offer = null;
  render();
});
els.offerDecline.addEventListener('click', () => {
  if (offer === 'draw_received') send({ type: 'draw_decline' });
  offer = null;
  render();
});

// Chat nhanh
for (const id of CHAT_PHRASES.keys()) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-chip';
  btn.dataset.i18n = `chat.${id}`;
  btn.textContent = t(`chat.${id}`);
  btn.addEventListener('click', () => send({ type: 'chat', id }));
  els.chatBar.append(btn);
}

// Xem lại ván
els.moves.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ply]');
  if (btn) goToPly(Number(btn.dataset.ply));
});
$('#nav-first').addEventListener('click', () => goToPly(0));
$('#nav-prev').addEventListener('click', () => goToPly((viewPly ?? game.moves.length) - 1));
$('#nav-next').addEventListener('click', () => goToPly((viewPly ?? game.moves.length) + 1));
$('#nav-last').addEventListener('click', () => goToPly(game.moves.length));
$('#review-live').addEventListener('click', () => goToPly(game.moves.length));
document.addEventListener('keydown', (e) => {
  if (mode === null || els.screens.game.hidden || document.querySelector('dialog[open]')) return;
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'ArrowLeft') goToPly((viewPly ?? game.moves.length) - 1);
  else if (e.key === 'ArrowRight') goToPly((viewPly ?? game.moves.length) + 1);
});

// Hộp thoại
$('#btn-sound').addEventListener('click', () => setSetting('sound', !settings.sound));
$('#btn-settings').addEventListener('click', () => els.settingsDialog.showModal());
$('#menu-settings').addEventListener('click', () => els.settingsDialog.showModal());
$('#settings-close').addEventListener('click', () => els.settingsDialog.close());
$('#btn-leaderboard').addEventListener('click', openLeaderboard);
$('#menu-leaderboard').addEventListener('click', openLeaderboard);
$('#leaderboard-close').addEventListener('click', () => els.leaderboardDialog.close());
for (const dialog of [els.settingsDialog, els.resultDialog, els.leaderboardDialog]) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}
$('#result-new').addEventListener('click', () => {
  els.resultDialog.close();
  restartGame();
});
$('#result-rematch').addEventListener('click', requestRematch);
$('#result-view').addEventListener('click', () => els.resultDialog.close());
$('#result-home').addEventListener('click', goHome);

// Màn hình chơi với máy
els.aiColor.querySelectorAll('[role="radio"]').forEach((btn) => {
  btn.setAttribute('aria-checked', String(btn.dataset.value === prefs.aiColor));
  btn.addEventListener('click', () => {
    els.aiColor.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  });
});
els.aiLevel.value = prefs.aiLevel;
els.aiLevel.addEventListener('input', updateLevelText);
updateLevelText();

// Lưu đồng hồ khi rời trang để lần sau tiếp tục đúng thời gian còn lại.
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame();
});

// ---------- Khởi động ----------
applySettings();
updateLangButtons();
show('menu');
initAccount({
  button: $('#btn-account'),
  banner: $('#account-banner'),
  dialog: $('#account-dialog'),
  onChange: (user) => {
    updateRatedHint();
    updatePuzzleCard();
    if (user) syncAchievements();
    if (mode !== null) render();
  },
  onLeaderboard: openLeaderboard,
  onAchievements: openAchievements,
  toast,
});

// Móc gỡ lỗi cho kiểm thử tự động, chỉ bật khi mở trang với ?debug
if (new URLSearchParams(location.search).has('debug')) {
  window.__covua = {
    board3d: () => board3d,
    game: () => game,
    selected: () => selected,
    clock: () => clock,
    viewPly: () => viewPly,
    puzzle: () => puzzle,
    // Nạp một thế cờ (FEN) để kiểm thử các tình huống như phong cấp.
    load(fen) {
      resetState();
      mode = mode ?? 'local';
      game = new Game(fen);
      show('game');
      render();
    },
  };
}

// Mở bằng liên kết phòng (?room=ABCDE) thì vào phòng luôn; còn phòng đang chơi dở thì nối lại.
const roomFromLink = new URLSearchParams(location.search).get('room');
if (roomFromLink) {
  els.roomCode.value = roomFromLink.toUpperCase().slice(0, 5);
  show('online');
  joinRoom();
} else if (roomSession()) {
  els.onlineMsg.textContent = t('online.rejoining');
  show('online');
  rejoinRoom();
}
