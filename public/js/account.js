// Tài khoản phía trình duyệt: đăng nhập, đăng ký, chơi nhanh (tài khoản chỉ cần biệt danh), hồ sơ.
// Người chơi không đăng nhập vẫn chơi bình thường với tư cách khách.

const state = { user: null, providers: {} };
let options = { onChange() {}, toast() {} };
let dom = {};
let tab = 'login';

export const getUser = () => state.user;

const KIND_LABEL = {
  email: 'Tài khoản email',
  quick: 'Tài khoản nhanh',
  google: 'Đăng nhập bằng Google',
  facebook: 'Đăng nhập bằng Facebook',
};
const LOGIN_ERRORS = {
  cancel: 'Bạn đã hủy đăng nhập.',
  state: 'Phiên đăng nhập đã hết hạn, hãy thử lại.',
  provider: 'Cách đăng nhập này chưa được bật trên máy chủ.',
  failed: 'Đăng nhập thất bại, hãy thử lại.',
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
    throw new Error('Không kết nối được máy chủ.');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Phản hồi không có nội dung JSON.
  }
  if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra, hãy thử lại.');
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
    button.title = `Tài khoản: ${state.user.name}`;
  } else {
    button.innerHTML = PERSON_ICON;
    button.title = 'Đăng nhập / Đăng ký';
  }
}

function renderBanner() {
  const user = state.user;
  dom.banner.replaceChildren(
    user
      ? h(
          'div',
          { class: 'banner-row' },
          h('div', { class: 'banner-text' }, h('strong', {}, `Xin chào, ${user.name}!`), h('span', {}, 'Ván online của bạn được ghi vào thống kê.')),
          h('button', { class: 'btn', type: 'button', onclick: () => openAccount() }, 'Tài khoản'),
        )
      : h(
          'div',
          { class: 'banner-row' },
          h(
            'div',
            { class: 'banner-text' },
            h('strong', {}, 'Chơi ngay không cần đăng ký'),
            h('span', {}, 'Đăng nhập để lưu thống kê và dùng tên của bạn khi chơi online.'),
          ),
          h('button', { class: 'btn primary', type: 'button', onclick: () => openAccount('login') }, 'Đăng nhập'),
        ),
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
      ? h('a', { class: `btn social ${name}`, href: `/api/auth/${name}` }, `Tiếp tục với ${label}`)
      : h('button', { class: `btn social ${name}`, type: 'button', disabled: true, title: 'Chưa được cấu hình trên máy chủ' }, `${label} (chưa bật)`),
  );
  const none = !Object.values(state.providers).some(Boolean);
  return h(
    'div',
    { class: 'social-block' },
    h('div', { class: 'divider' }, h('span', {}, 'hoặc dùng mạng xã hội')),
    h('div', { class: 'social-buttons' }, buttons),
    none ? h('p', { class: 'hint' }, 'Đăng nhập mạng xã hội cần quản trị viên cấu hình khóa OAuth trên máy chủ (xem README).') : null,
  );
}

function welcome(data, message) {
  setUser(data.user);
  dom.dialog.close();
  options.toast(message(data.user));
}

function guestView() {
  const tabs = [['login', 'Đăng nhập'], ['register', 'Đăng ký'], ['quick', 'Chơi nhanh']];
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
      form('Đăng nhập', [field('Email', email), field('Mật khẩu', password)], () => request('/api/auth/login', { email: email.value, password: password.value }), (data) =>
        welcome(data, (u) => `Chào mừng trở lại, ${u.name}!`),
      ),
      socialButtons(),
    ];
  } else if (tab === 'register') {
    const name = h('input', { type: 'text', autocomplete: 'nickname', placeholder: 'Tên hiển thị (2–24 ký tự)', maxlength: 24, required: true });
    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'ten@email.com', maxlength: 254, required: true });
    const password = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Ít nhất 8 ký tự', maxlength: 128, required: true });
    content = [
      form(
        'Tạo tài khoản',
        [field('Tên hiển thị', name), field('Email', email), field('Mật khẩu', password)],
        () => request('/api/auth/register', { name: name.value, email: email.value, password: password.value }),
        (data) => welcome(data, (u) => `Đã tạo tài khoản, xin chào ${u.name}!`),
      ),
      h('p', { class: 'hint' }, 'Hiện chưa xác minh email và chưa có chức năng quên mật khẩu, hãy ghi nhớ mật khẩu của bạn.'),
      socialButtons(),
    ];
  } else {
    const name = h('input', { type: 'text', autocomplete: 'nickname', placeholder: 'Biệt danh của bạn', maxlength: 24, required: true });
    content = [
      h('p', { class: 'hint' }, 'Chỉ cần một biệt danh là chơi được ngay, không cần email hay mật khẩu. Bạn có thể gắn email sau để đăng nhập lại trên thiết bị khác.'),
      form('Vào chơi ngay', [field('Biệt danh', name)], () => request('/api/auth/quick', { name: name.value }), (data) =>
        welcome(data, (u) => `Xin chào ${u.name}, chúc bạn chơi vui!`),
      ),
      h('div', { class: 'divider' }, h('span', {}, 'hoặc')),
      h('button', { class: 'btn block', type: 'button', onclick: () => dom.dialog.close() }, 'Chơi với tư cách khách'),
      h('p', { class: 'hint' }, 'Khách vẫn chơi được mọi chế độ, chỉ không có thống kê. Nếu xóa dữ liệu trình duyệt khi chưa gắn email, tài khoản nhanh sẽ mất.'),
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
      h('div', {}, h('div', { class: 'profile-name' }, user.name), h('div', { class: 'hint' }, [KIND_LABEL[user.kind] ?? 'Tài khoản', user.email ? ` · ${user.email}` : ''])),
    ),
    h('div', { class: 'label' }, 'Thống kê chơi online'),
    h('div', { class: 'stats' }, stat(stats.played, 'Ván'), stat(stats.wins, 'Thắng'), stat(stats.losses, 'Thua'), stat(stats.draws, 'Hòa')),
  ];

  if (user.kind === 'quick') {
    const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'ten@email.com', maxlength: 254, required: true });
    const password = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Ít nhất 8 ký tự', maxlength: 128, required: true });
    nodes.push(
      h('div', { class: 'upgrade' }, h('strong', {}, 'Giữ tài khoản của bạn'), h('p', { class: 'hint' }, 'Gắn email và mật khẩu để đăng nhập lại trên thiết bị khác, kể cả khi xóa dữ liệu trình duyệt.')),
      form('Gắn email cho tài khoản', [field('Email', email), field('Mật khẩu', password)], () => request('/api/auth/upgrade', { email: email.value, password: password.value }), (data) => {
        setUser(data.user);
        render();
        options.toast('Đã gắn email cho tài khoản.');
      }),
    );
  }

  nodes.push(
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
          options.toast('Đã đăng xuất.');
        },
      },
      'Đăng xuất',
    ),
  );
  return nodes;
}

function render() {
  dom.title.textContent = state.user ? 'Tài khoản' : tab === 'quick' ? 'Chơi nhanh' : tab === 'register' ? 'Đăng ký' : 'Đăng nhập';
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
  if (error) options.toast(LOGIN_ERRORS[error] ?? LOGIN_ERRORS.failed);
  else options.toast(`Đăng nhập thành công${state.user ? `, xin chào ${state.user.name}!` : '.'}`);
}

export async function initAccount({ button, banner, dialog, onChange, toast }) {
  options = { onChange, toast };
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
