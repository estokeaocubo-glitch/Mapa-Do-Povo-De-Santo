// Servidor local de desenvolvimento/produção simples (Node ≥ 18, sem framework).
// Serve /public e encaminha /api/<rota> para os handlers em /api — os mesmos
// arquivos usados como funções serverless no deploy (Vercel).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import terreiros from './api/terreiros.js';
import estatisticas from './api/estatisticas.js';
import cadastro from './api/cadastro.js';
import admin from './api/admin.js';
import { getDb } from './lib/db.js';
import { SECURITY_HEADERS } from './lib/security-headers.js';

const ROOT = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const PORT = Number(process.env.PORT || 3000);
const ROUTES = { '/api/terreiros': terreiros, '/api/estatisticas': estatisticas, '/api/cadastro': cadastro, '/api/admin': admin };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const { pathname } = new URL(req.url, 'http://localhost');

  const route = ROUTES[pathname.replace(/\/$/, '')];
  if (route) return route(req, res);
  if (pathname.startsWith('/api/')) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end('{"erro":"Rota não encontrada."}');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    return res.end();
  }

  // Arquivos estáticos, com proteção contra path traversal.
  let file = normalize(join(ROOT, decodeURIComponent(pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', file.includes(`${sep}vendor${sep}`) ? 'public, max-age=86400' : 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Não encontrado');
  }
});

await getDb(); // inicializa o banco antes de aceitar conexões
server.listen(PORT, () => console.log(`Mapa do Povo de Santo → http://localhost:${PORT}`));
