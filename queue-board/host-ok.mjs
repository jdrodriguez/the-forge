// host-ok.mjs: which Host headers the board answers to, and who sent a request. board.mjs asks it on every route but
// /healthz. A page on another site that points its own domain at this address (DNS rebinding) sends its own name, so it
// gets nothing.
//   port         the board's own port (queueBoard.port)
//   me           this machine's short host name, lower case
//   bind         the addresses the board listens on (queueBoard.bind): literal addresses and the word "tailscale"
//   tailscaleIp  its Tailscale address, once known
//   tsName       its full Tailscale name (<machine>.<tailnet>.ts.net), read from Tailscale itself, once known
// On the board's port it answers to loopback, the short name, each literal address it listens on, the Tailscale address
// and, when it listens on Tailscale, the machine's ts.net name. With no port, or 443, it answers to tsName alone: that
// is how `tailscale serve` hands on an HTTPS request, and the HTTPS address is the one a phone can install the app
// from. Any other name, another machine's ts.net name included, is refused.
export function hostAllowed(host, { port, me, bind = [], tailscaleIp = null, tsName = null }) {
  const m = String(host ?? '').toLowerCase().match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!m) return false;
  if (tsName && m[1] === tsName && (m[2] === undefined || Number(m[2]) === 443)) return true;
  if (Number(m[2] ?? 80) !== port) return false;
  const literal = bind.filter((a) => a !== 'tailscale').map((a) => (a.includes(':') ? `[${a}]` : a).toLowerCase());
  if (['127.0.0.1', 'localhost', me, tailscaleIp, ...literal].includes(m[1])) return true;
  return bind.includes('tailscale') && new RegExp(`^${me}\\.[a-z0-9-]+\\.ts\\.net$`).test(m[1]);
}

// The machine's own ts.net name out of `tailscale status --json` (CertDomains, set once the tailnet has HTTPS on), or null.
export function certName(status) {
  const name = String(status?.CertDomains?.[0] ?? '').toLowerCase();
  return /^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(name) ? name : null;
}

// Who sent a request. Behind `tailscale serve` every request arrives from this machine (from loopback when the proxy
// points at 127.0.0.1), so the socket's address alone would make a phone look like the board's own machine. A request
// from loopback, or from one of the machine's own addresses (own), is judged by the address the proxy names in
// X-Forwarded-For (its last entry, the one the nearest proxy wrote). One that came without the board's port in its Host
// and without that header counts as a stranger. A caller on another machine is its socket's address, whatever headers
// it sends.
export function callerOf(req, { port, own = [] }) {
  const sock = String(req.socket?.remoteAddress).replace(/^::ffff:/, '');
  if (!['127.0.0.1', '::1', ...own].includes(sock)) return sock;
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',').pop().trim().replace(/^::ffff:/, '');
  if (fwd) return fwd;
  return String(req.headers.host ?? '').endsWith(`:${port}`) ? sock : 'proxied';
}
