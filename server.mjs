import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist', import.meta.url));
const port = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // 健康检查端点：供 Docker HEALTHCHECK 与 verify 冒烟使用。
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'theater-counterweight-adjudicator',
          time: new Date().toISOString(),
        }),
      );
      return;
    }

    const pathname = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    const file = join(root, pathname === '' ? 'index.html' : pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }

    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      // SPA 回退：其余路径一律返回 index.html。
      const data = await readFile(join(root, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(data);
    }
  } catch {
    res.writeHead(500);
    res.end('internal error');
  }
});

server.listen(port, () => {
  console.log(`web ready on :${port} (health: /healthz)`);
});
