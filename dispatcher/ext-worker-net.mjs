#!/usr/bin/env node
// ext-worker-net.mjs: the only way a queue engine reaches the network. The sandbox lets the engine's process tree
// connect to nothing but this proxy and the loopback ports the config allows (sandbox-exec on macOS; on Linux an empty network
// namespace with `bridge` inside), and the proxy, which runs outside the sandbox, opens a connection only to a host on
// the allowlist. Every decision is logged, one JSON line each, for the after-run audit.
// ext-worker.sh starts it outside the sandbox and stops it by PID.
//
//   proxy  --listen <port|unix:path> --allow <host,...> --log <file>
//          HTTP proxy: CONNECT for https and absolute-URI requests for http, ports 443 and 80 only. A host matches an
//          entry exactly, or "*.example.com" matches any subdomain of example.com.
//   bridge --map <port>=unix:<path> [...]     inside the sandbox: loopback TCP listeners that forward to unix sockets
//   forward --listen unix:<path> --to <port>  outside: a unix socket that forwards to 127.0.0.1:<port>
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export function hostAllowed(host, allow) {
  const h = String(host).toLowerCase().replace(/\.$/, '');
  return allow.some((a) => (a.startsWith('*.') ? h.endsWith(a.slice(1)) && h.length > a.length - 1 : h === a));
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i].replace(/^--/, '');
    (o[k] ??= []).push(argv[i + 1]);
    i += 1;
  }
  return o;
}

const listenOn = (server, spec) => {
  if (spec.startsWith('unix:')) {
    const p = spec.slice(5);
    try {
      fs.unlinkSync(p);
    } catch {
      // not there yet
    }
    server.listen(p, () => fs.chmodSync(p, 0o600));
  } else server.listen(Number(spec), '127.0.0.1');
};

function proxy(o) {
  const allow = (o.allow?.[0] ?? '').split(',').filter(Boolean).map((s) => s.toLowerCase());
  const logFile = o.log?.[0];
  const log = (rec) => {
    if (logFile) fs.appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...rec })}\n`);
  };
  const decide = (host, port) => {
    const ok = (port === 443 || port === 80) && hostAllowed(host, allow);
    log({ host, port, allowed: ok });
    return ok;
  };
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url);
    } catch {
      res.writeHead(400).end('ext-worker proxy: absolute URL required\n');
      return;
    }
    const port = Number(url.port || 80);
    if (url.protocol !== 'http:' || !decide(url.hostname, port)) {
      res.writeHead(403, { 'x-proxy-error': 'blocked-by-allowlist' }).end(`ext-worker proxy: ${url.hostname} is not on this worker's allowlist\n`);
      return;
    }
    const up = http.request({ host: url.hostname, port, method: req.method, path: url.pathname + url.search, headers: req.headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => res.writeHead(502).end());
    req.pipe(up);
  });
  server.on('connect', (req, sock, head) => {
    const [host, p] = String(req.url).split(/:(?=\d+$)/);
    const port = Number(p || 443);
    if (!decide(host, port)) {
      sock.end('HTTP/1.1 403 Forbidden\r\nx-proxy-error: blocked-by-allowlist\r\n\r\n');
      return;
    }
    const up = net.connect(port, host, () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(sock);
      sock.pipe(up);
    });
    up.on('error', () => sock.destroy());
    sock.on('error', () => up.destroy());
  });
  listenOn(server, o.listen[0]);
}

function pipeServer(spec, connectTo) {
  const s = net.createServer((c) => {
    const up = net.connect(connectTo);
    c.pipe(up);
    up.pipe(c);
    up.on('error', () => c.destroy());
    c.on('error', () => up.destroy());
  });
  listenOn(s, spec);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const o = args(rest);
  if (cmd === 'proxy') return proxy(o);
  if (cmd === 'bridge') {
    for (const m of o.map ?? []) {
      const [port, target] = m.split('=');
      pipeServer(port, target.replace(/^unix:/, ''));
    }
    return undefined;
  }
  if (cmd === 'forward') return pipeServer(o.listen[0], { host: '127.0.0.1', port: Number(o.to[0]) });
  console.error(`unknown command: ${cmd}`);
  process.exitCode = 2;
  return undefined;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
