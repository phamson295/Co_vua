// Tài khoản phía trình duyệt: đăng nhập, đăng ký, chơi nhanh (tài khoản chỉ cần biệt danh), hồ sơ.
// Người chơi không đăng nhập vẫn chơi bình thường với tư cách khách.
import { POOLS } from './shared.js';
import { t } from './i18n.js';

const state = { user: null, providers: {} };
let options = { onChange() {}, toast() {}, onLeaderboard() {}, onAchievements() {} };
let dom = {};
let tab = 'login';

export const getUser = () => state.user;

const KIND_LABEL = {
  email: 'acc.kind.email',
  quick: 'acc.kind.quick',
  google: 'acc.kind.google',
  facebook: 'acc.kind.facebook',
};
const LOGIN_ERRORS = {
  cancel: 'acc.loginError.cancel',
  state: 'acc.loginError.state',
  provider: 'acc.loginError.provider',
  failed: 'acc.loginError.failed',
};

// Tạo phần tử DOM; nội dung chữ luôn đi qua text node nên không có nguy cơ chèn mã HTML.
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else if (value !== false && value != null) el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

async function request(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new Error(t('acc.noServer'));
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Phản hồi không có nội dung JSON.
  }
  if (!res.ok) {
    const k = `err.${data.code}`;
    throw new Error(data.code && t(k) !== k ? t(k) : data.error || t('acc.genericError'));
  }
  return data;
}

function setUser(user) {
  state.user = user;
  renderButton();
  renderBanner();
  options.onChange(user);
}

export async function refreshAccount() {
  try {
    const data = await request('/api/me');
    state.providers = data.providers ?? {};
    setUser(data.user);
  } catch {
    // Không có máy chủ tài khoản (ví dụ mở file trực tiếp): vẫn chơi như khách.
    setUser(null);
  }
}

// ----- Nút trên thanh đầu và biểu ngữ ở menu -----
const PERSON_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

function initial(name) {
  return [...name][0]?.toUpperCase() ?? '?';
}

function renderButton() {
  const button = dom.button;
  if (state.user) {
    button.replaceChildren(h('span', { class: 'initial' }, initial(state.user.name)));
    button.title = t('acc.buttonTitle', { name: state.user.name });
  } else {
    button.innerHTML = PERSON_ICON;
    button.title = t('acc.loginRegister');
  }
}

function renderBanner() {
  const user = state.user;
  dom.banner.replaceChildren(
    user
      ? h(
          'div',
          { class: 'banner-row' },
          h(
            'div',
            { class: 'banner-text' },
            h('strong', {}, t('acc.hello', { name: user.name })),
            xpLine(user.xp),
          ),
          h('button', { class: 'btn', type: 'button', onclick: () => openAccount() }, t('acc.account')),
        )
      : h(
          'div',
          { class: 'banner-row' },
          h(
            'div',
            { class: 'banner-text' },
            h('strong', {}, t('acc.bannerTitle')),
            h('span', {}, t('acc.bannerText')),
          ),
          h('button', { class: 'btn primary', type: 'button', onclick: () => openAccount('login') }, t('acc.login')),
        ),
  );
}

// Thanh EXP: "Cấp 3 ▰▰▱▱ 120/187 EXP"
function xpLine(xp) {
  if (!xp) return null;
  const percent = xp.need ? Math.round((xp.into / xp.need) * 100) : 100;
  return h(
    'span',
    { class: 'xp-line' },
    h('span', { class: 'level-badge' }, t('level.badge', { level: xp.level })),
    h('span', { class: 'xp-bar' }, h('span', { style: `width:${percent}%` })),
    h('span', { class: 'xp-num' }, xp.need ? `${xp.into}/${xp.need} EXP` : t('acc.maxLevel')),
  );
}

// ----- Hộp thoại -----
function field(label, input) {
  return h('label', { class: 'field-row' }, h('span', { class: 'field-label' }, label), input);
}

// Biểu mẫu có thông báo lỗi và nút gửi; `action` trả về dữ liệu từ máy chủ.
function form(submitLabel, inputs, action, onDone) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, submitLabel);
  return h(
    'form',
    {
      class: 'account-form',
      novalidate: true,
      async onsubmit(event) {
        event.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        try {
          onDone(await action());
        } catch (e) {
          error.textContent = e.message;
        } finally {
          submit.disabled = false;
        }
      },
    },
    inputs,
    error,
    submit,
  );
}

function socialButtons() {
  const buttons = [['google', 'Google'], ['facebook', 'Facebook']].map(([name, label]) =>
    state.providers[name]
      ? h('a', { class: `btn social ${name}`, href: `/api/auth/${name}` }, t('acc.continueWith', { provider: label }))
      : h('button', { class: `btn social ${name}`, type: 'button', disabled: true, title: t('acc.providerNotConfigured') }, t('acc.providerOff', { provider: label })),
  );
  const none = !Object.values(state.providers).some(Boolean);
  return h(
    'div',
    { class: 'social-block' },
    h('div', { class: 'divider' }, h('span', {}, t('acc.orSocial'))),
    h('div', { class: 'social-buttons' }, buttons),
    none ? h('p', { class: 'hint' }, t('acc.socialHint')) : null,
  );
}

function welcome(data, message) {
  setUser(data.user);
  dom.dialog.close();
  options.toast(message(data.user));
}

function guestView() {
  const tabs = [['login', t('acc.login')], ['register', t('acc.register')], ['quick', t('acc.quick')]];
  const switcher = h(
    'div',
    { class: 'segmented', role: 'tablist' },
    tabs.map(([id, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-checked': String(id === tab), onclick: () => ((tab = id), render()) }, label),
    ),
  );

  let content;
  if (tab === 'login') {
    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'ten@email.com', maxlength: 254, required: true });
    const password = h('input', { type: 'password', autocomplete: 'current-password', maxlength: 128, required: true });
    content = [
      form(t('acc.login'), [field('Email', email), field(t('acc.password'), password)], () => request('/api/auth/login', { email: email.value, password: password.value }), (data) =>
        welcome(data, (u) => t('acc.welcomeBack', { name: u.name })),
      ),
      socialButtons(),
    ];
  } else if (tab === 'register') {
    const name = h('input', { type: 'text', autocomplete: 'nickname', placeholder: t('acc.namePlaceholder'), maxlength: 24, required: true });
    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'ten@email.com', maxlength: 254, required: true });
    const password = h('input', { type: 'password', autocomplete: 'new-password', placeholder: t('acc.passwordPlaceholder'), maxlength: 128, required: true });
    content = [
      form(
        t('acc.createAccount'),
        [field(t('acc.displayName'), name), field('Email', email), field(t('acc.password'), password)],
        () => request('/api/auth/register', { name: name.value, email: email.value, password: password.value }),
        (data) => welcome(data, (u) => t('acc.created', { name: u.name })),
      ),
      h('p', { class: 'hint' }, t('acc.noVerifyHint')),
      socialButtons(),
    ];
  } else {
    const name = h('input', { type: 'text', autocomplete: 'nickname', placeholder: t('acc.nicknamePlaceholder'), maxlength: 24, required: true });
    content = [
      h('p', { class: 'hint' }, t('acc.quickHint')),
      form(t('acc.playNow'), [field(t('acc.nickname'), name)], () => request('/api/auth/quick', { name: name.value }), (data) =>
        welcome(data, (u) => t('acc.quickHello', { name: u.name })),
      ),
      h('div', { class: 'divider' }, h('span', {}, t('acc.or'))),
      h('button', { class: 'btn block', type: 'button', onclick: () => dom.dialog.close() }, t('acc.playAsGuest')),
      h('p', { class: 'hint' }, t('acc.guestHint')),
    ];
  }
  return [switcher, ...content];
}

function profileView() {
  const user = state.user;
  const stats = user.stats?.online ?? { played: 0, wins: 0, losses: 0, draws: 0 };
  const stat = (value, label) => h('div', { class: 'stat' }, h('strong', {}, value), h('span', {}, label));
  const nodes = [
    h(
      'div',
      { class: 'profile-head' },
      h('span', { class: 'avatar big' }, initial(user.name)),
      h('div', {}, h('div', { class: 'profile-name' }, user.name), h('div', { class: 'hint' }, [t(KIND_LABEL[user.kind] ?? 'acc.account'), user.email ? ` · ${user.email}` : ''])),
    ),
    xpLine(user.xp),
    h('div', { class: 'label' }, t('acc.ratingTitle')),
    h(
      'div',
      { class: 'stats three' },
      Object.entries(POOLS).map(([pool, label]) => {
        const r = user.ratings?.[pool] ?? { rating: 1500, provisional: true };
        return stat(`${r.rating}${r.provisional ? '?' : ''}`, label);
      }),
    ),
    h('div', { class: 'label' }, t('acc.onlineStats')),
    h('div', { class: 'stats' }, stat(stats.played, t('acc.games')), stat(stats.wins, t('acc.wins')), stat(stats.losses, t('acc.losses')), stat(stats.draws, t('acc.draws'))),
    h('div', { class: 'label' }, t('acc.puzzleAch')),
    h(
      'div',
      { class: 'stats three' },
      stat(Math.round(user.puzzle?.rating ?? 1000), 'Puzzle Rating'),
      stat(user.puzzle?.solved ?? 0, t('acc.puzzlesSolved')),
      stat(Object.keys(user.achievements ?? {}).length, t('acc.achievements')),
    ),
  ];

  if (user.kind === 'quick') {
    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'ten@email.com', maxlength: 254, required: true });
    const password = h('input', { type: 'password', autocomplete: 'new-password', placeholder: t('acc.passwordPlaceholder'), maxlength: 128, required: true });
    nodes.push(
      h('div', { class: 'upgrade' }, h('strong', {}, t('acc.keepTitle')), h('p', { class: 'hint' }, t('acc.keepText'))),
      form(t('acc.linkEmail'), [field('Email', email), field(t('acc.password'), password)], () => request('/api/auth/upgrade', { email: email.value, password: password.value }), (data) => {
        setUser(data.user);
        render();
        options.toast(t('acc.emailLinked'));
      }),
    );
  }

  const renameInput = h('input', { type: 'text', value: user.name, maxlength: 24, autocomplete: 'nickname', 'aria-label': t('acc.newName') });
  const renameForm = form(t('acc.saveName'), [field(t('acc.displayName'), renameInput)], () => request('/api/account/name', { name: renameInput.value }), (data) => {
    setUser(data.user);
    render();
    options.toast(t('acc.renamed'));
  });
  renameForm.hidden = true;

  nodes.push(
    h(
      'div',
      { class: 'account-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => (dom.dialog.close(), options.onLeaderboard()) }, t('acc.leaderboard')),
      h('button', { class: 'btn', type: 'button', onclick: () => (dom.dialog.close(), options.onAchievements()) }, t('acc.achievements')),
      h('button', { class: 'btn', type: 'button', onclick: () => (renameForm.hidden = !renameForm.hidden) }, t('acc.rename')),
      h(
        'button',
        {
          class: 'btn danger-outline',
          type: 'button',
          async onclick() {
            const answer = window.prompt(t('acc.deletePrompt'));
            if (answer === null) return;
            try {
              await request('/api/account/delete', { confirm: answer.trim().toUpperCase() });
              setUser(null);
              tab = 'login';
              dom.dialog.close();
              options.toast(t('acc.deleted'));
            } catch (e) {
              options.toast(e.message);
            }
          },
        },
        t('acc.delete'),
      ),
    ),
    renameForm,
    h(
      'button',
      {
        class: 'btn block',
        type: 'button',
        async onclick() {
          try {
            await request('/api/auth/logout', {});
          } catch {
            // Dù máy chủ không phản hồi vẫn xóa trạng thái trên trình duyệt.
          }
          setUser(null);
          tab = 'login';
          dom.dialog.close();
          options.toast(t('acc.loggedOut'));
        },
      },
      t('acc.logout'),
    ),
  );
  return nodes;
}

function render() {
  dom.title.textContent = state.user ? t('acc.account') : tab === 'quick' ? t('acc.quick') : tab === 'register' ? t('acc.register') : t('acc.login');
  dom.body.replaceChildren(...(state.user ? profileView() : guestView()));
}

export async function openAccount(initialTab) {
  if (initialTab) tab = initialTab;
  await refreshAccount();
  render();
  if (!dom.dialog.open) dom.dialog.showModal();
}

// Xử lý kết quả khi quay về từ trang đăng nhập mạng xã hội (?login=ok hoặc ?login_error=...).
function handleLoginRedirect() {
  const params = new URLSearchParams(location.search);
  const ok = params.get('login') === 'ok';
  const error = params.get('login_error');
  if (!ok && !error) return;
  params.delete('login');
  params.delete('login_error');
  const rest = params.toString();
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
  if (error) options.toast(t(LOGIN_ERRORS[error] ?? LOGIN_ERRORS.failed));
  else options.toast(state.user ? t('acc.loginOkName', { name: state.user.name }) : t('acc.loginOk'));
}

export async function initAccount({ button, banner, dialog, onChange, toast, onLeaderboard, onAchievements }) {
  options = { onChange, toast, onLeaderboard, onAchievements };
  dom = { button, banner, dialog, title: dialog.querySelector('#account-title'), body: dialog.querySelector('#account-body') };
  button.addEventListener('click', () => openAccount());
  dialog.querySelector('#account-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  renderButton();
  renderBanner();
  await refreshAccount();
  handleLoginRedirect();
}

// Vẽ lại phần tài khoản sau khi đổi ngôn ngữ.
export function rerenderAccount() {
  if (!dom.button) return;
  renderButton();
  renderBanner();
  if (dom.dialog.open) render();
}
