/*
  A static file server for the repository root, in one file with no
  dependencies.

  The game is native ESM with no build step, so all it needs is something that
  answers HTTP -- but "any static server will do" is only true for someone who
  already has one. This is the one that ships with the project: `npm start`
  runs it on Node alone, which the test suite already requires, so there is
  nothing to install and no Python to find.

  It picks a free port rather than failing on a busy one, and opens a browser,
  so starting the game is a single command with no second step.
*/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Only the types this repository actually serves. An unknown extension is
// deliberately sent as an octet-stream rather than guessed at: a mislabelled
// module is a silent failure in the browser, and a download is not.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const startPort = Number(value('--port') ?? process.env.PORT ?? 8000);
const openBrowser = !flag('--no-open');

/*
  Resolve a request path to a file inside ROOT, or null.

  The guard is the reason this is not three lines: decodeURIComponent turns
  %2e%2e back into .., so the containment check has to happen after decoding
  and after resolving, on the real absolute path.
*/
function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }

  const target = path.resolve(ROOT, '.' + decoded);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;

  // The page needs no dotfile, and the repository root holds .git. Serving it
  // over even a localhost port is a habit worth not having.
  if (decoded.split(/[/\\]/).some((part) => part.startsWith('.') && part !== '.')) return null;

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return null;
  }

  if (stat.isDirectory()) {
    const index = path.join(target, 'index.html');
    return fs.existsSync(index) ? index : null;
  }
  return target;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url ?? '/');

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found\n');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    // A dev server that caches modules makes an edit look like it did nothing.
    'Cache-Control': 'no-store',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  fs.createReadStream(file)
    .on('error', () => res.end())
    .pipe(res);
});

/*
  A busy port is the common case -- a previous run, another project -- and
  exiting on it makes the user do work the server can do itself. Walk upward
  until something free turns up.
*/
let port = startPort;
const LAST_PORT = startPort + 20;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && port < LAST_PORT) {
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error(`Could not start the server: ${err.message}`);
  process.exit(1);
});

server.on('listening', () => {
  const url = `http://localhost:${port}`;
  console.warn(`Alien Escape is running at ${url}`);
  console.warn('Press Ctrl+C to stop.');
  if (openBrowser) open(url);
});

function open(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? // start is a cmd builtin, and its first quoted argument is the window
        // title, so the empty string keeps the URL from being eaten as one.
        ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];

  // A machine with no browser to launch is not a reason to stop serving.
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true })
    .on('error', () => {})
    .unref();
}

server.listen(port, '127.0.0.1');
