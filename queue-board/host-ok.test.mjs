// host-ok.test.mjs: node --test queue-board/host-ok.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostAllowed, certName, callerOf } from './host-ok.mjs';

const TS = 'main-mac.example-tailnet.ts.net';
const board = { port: 8787, me: 'main-mac', bind: ['127.0.0.1', 'tailscale'], tailscaleIp: '100.64.0.7', tsName: TS };
const ok = (host, o = board) => hostAllowed(host, o);

test('the names the board is reached by on its own port', () => {
  for (const h of ['127.0.0.1:8787', 'localhost:8787', 'main-mac:8787', 'MAIN-MAC:8787', '100.64.0.7:8787', `${TS}:8787`]) assert.equal(ok(h), true, h);
});

test('the HTTPS address behind tailscale serve: the ts.net name with no port or 443', () => {
  assert.equal(ok(TS), true);
  assert.equal(ok(`${TS}:443`), true);
  assert.equal(ok('Main-Mac.Example-Tailnet.ts.net'), true);
});

test('nothing wider passes without the port', () => {
  for (const h of ['localhost', '127.0.0.1', 'main-mac', '100.64.0.7', 'localhost:443', 'main-mac:443', '127.0.0.1:80',
    'evil.example', 'evil.example:443', 'evil.example:8787', 'other-mac.example-tailnet.ts.net', 'other-mac.example-tailnet.ts.net:443',
    'other-mac.example-tailnet.ts.net:8787', 'main-mac.other-net.ts.net', 'main-mac.other-net.ts.net:443', `${TS}.evil.example`,
    `${TS}:80`, `${TS}:8443`, `x${TS}`, '', undefined, 'a:b:c']) assert.equal(ok(h), false, String(h));
});

test('with no ts.net name known, no port means refused', () => {
  const o = { ...board, tsName: null };
  assert.equal(ok(TS, o), false);
  assert.equal(ok(`${TS}:443`, o), false);
  assert.equal(ok(`${TS}:8787`, o), true);
});

test('queueBoard.bind decides the rest: a literal address is a name, and ts.net names need "tailscale"', () => {
  const lan = { port: 8787, me: 'main-mac', bind: ['127.0.0.1', '192.0.2.10', 'fd00::10'] };
  for (const h of ['127.0.0.1:8787', 'localhost:8787', 'main-mac:8787', '192.0.2.10:8787', '[fd00::10]:8787', '[FD00::10]:8787']) assert.equal(ok(h, lan), true, h);
  for (const h of [`${TS}:8787`, TS, '192.0.2.11:8787', '192.0.2.10', '192.0.2.10:443', '[fd00::11]:8787', 'tailscale:8787', '100.64.0.7:8787']) assert.equal(ok(h, lan), false, h);
  assert.equal(ok('tailscale:8787'), false);
  assert.equal(ok('localhost:8787', { port: 8787, me: 'main-mac' }), true);
});

test('certName takes only a machine.tailnet.ts.net name', () => {
  assert.equal(certName({ CertDomains: ['Main-Mac.example-tailnet.ts.net'] }), TS);
  for (const s of [{}, null, { CertDomains: null }, { CertDomains: [] }, { CertDomains: ['evil.example'] }, { CertDomains: ['a.b.c.ts.net'] }, { CertDomains: ['ts.net'] }]) assert.equal(certName(s), null);
});

const req = (remoteAddress, headers) => ({ socket: { remoteAddress }, headers });

test('callerOf: a proxied request is judged by the address the proxy names', () => {
  const o = { port: 8787 };
  assert.equal(callerOf(req('127.0.0.1', { host: '127.0.0.1:8787' }), o), '127.0.0.1');
  assert.equal(callerOf(req('::ffff:127.0.0.1', { host: 'localhost:8787' }), o), '127.0.0.1');
  assert.equal(callerOf(req('127.0.0.1', { host: TS, 'x-forwarded-for': '100.64.0.9' }), o), '100.64.0.9');
  assert.equal(callerOf(req('127.0.0.1', { host: TS, 'x-forwarded-for': '127.0.0.1, 100.64.0.9' }), o), '100.64.0.9');
  assert.equal(callerOf(req('127.0.0.1', { host: TS }), o), 'proxied');
  assert.equal(callerOf(req('127.0.0.1', { host: `${TS}:443` }), o), 'proxied');
  // A caller on another machine cannot talk its way in with the header.
  assert.equal(callerOf(req('100.64.0.9', { host: '100.64.0.7:8787', 'x-forwarded-for': '127.0.0.1' }), o), '100.64.0.9');
});

test('callerOf: a proxy that points at one of the machine\'s own addresses is still a proxy', () => {
  const o = { port: 8787, own: ['100.64.0.7', '127.0.0.1', 'tailscale'] };
  // A browser on the machine itself, straight to its Tailscale address.
  assert.equal(callerOf(req('100.64.0.7', { host: '100.64.0.7:8787' }), o), '100.64.0.7');
  // The proxy, handing on a phone's request from that same address.
  assert.equal(callerOf(req('100.64.0.7', { host: TS, 'x-forwarded-for': '100.64.0.9' }), o), '100.64.0.9');
  assert.equal(callerOf(req('100.64.0.7', { host: TS }), o), 'proxied');
  // Without the list, only loopback is the machine itself.
  assert.equal(callerOf(req('100.64.0.7', { host: TS, 'x-forwarded-for': '100.64.0.9' }), { port: 8787 }), '100.64.0.7');
});
