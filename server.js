// Máy chủ: phục vụ giao diện tĩnh, API tài khoản (/api) và phòng chơi online qua WebSocket (/ws, xem server/game-server.js).
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store } from './server/store.js';
import { createAuth } from './server/auth.js';
import { attachGameServer } from './server/game-server.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export async function startServer({
  port = Number(process.env.PORT) || 3000,
  dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'),
  env = process.env,
  clockScale = 1, // < 1 khi kiểm thử để đồng hồ chạy nhanh hơn
  graceMs = 60000, // thời gian chờ người chơi mất kết nối quay lại
} = {}) {
  const store = new Store(path.join(dataDir, 'data.json'));
  const auth = createAuth({ store, env });

  const server = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, SECURITY_HEADERS).end();
      return;
    }

    if (pathname.startsWith('/api/')) {
      await auth.handle(req, res, new URL(req.url, 'http://localhost'));
      return;
    }

    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC_DIR, relative));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403, SECURITY_HEADERS).end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Không tìm thấy trang');
    }
  });

  const games = attachGameServer({ server, auth, store, clockScale, graceMs });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    server,
    store,
    port: server.address().port,
    async close() {
      games.close();
      await new Promise((resolve) => server.close(resolve));
      store.flush();
    },
  };
}

// Chạy trực tiếp: node server.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startServer();
  console.log(`Cờ vua đang chạy tại http://localhost:${port}`);
  if (!process.env.SESSION_SECRET) {
    console.log('Gợi ý: đặt biến môi trường SESSION_SECRET để giữ phiên đăng nhập ổn định.');
  }
}
