// herald-links.mjs: where a click on each herald notification goes. Pure functions over an event (herald-events.mjs),
// so herald.test files can check every route without a board. The herald passes the link to its notifier app
// (herald-notifier.swift), which opens it when the notification is clicked.
//   a worker blocked, waiting, stuck, CI failing or asking for a merge   <board>#session=ABC-123 (its session panel)
//   a Claude app session waiting (the eagle)        claude://code/continue?session=local_<id> on the Mac it runs on,
//                                                   <board>#sessions/local_<id> (its panel on the board) anywhere else
//   a machine out of reach or paused                <board>#fleet/<host>
//   main red                                        the failing run on GitHub
//   the reminder, and an ask with no worker         <board>#sec-needs (the Queue at Needs you)
//   a merge, main green                             nothing: these play their sound and post no banner
// The board's address comes from the snapshot (board.url, the address a phone or the installed app uses), so a link
// works from any device. A board that names none (its Tailscale address not known yet) gets the address the herald reads it at.

export const SOUND_ONLY = new Set(['merge', 'mainGreen']);
const TICKET = /^[A-Z][A-Z0-9]*-\d+$/;
const SESSION = /^local_[A-Za-z0-9-]{1,64}$/;
const HOST = /^[A-Za-z0-9-]+$/;

// The board's address for links, ending in a slash: the one the snapshot names, else the address the herald reads the
// board at, which a click on the same machine reaches too.
export function boardUrl(snap, base) {
  const own = snap?.board?.url;
  if (typeof own === 'string' && /^https?:\/\/[A-Za-z0-9.:[\]-]+\/?$/.test(own)) return own.endsWith('/') ? own : `${own}/`;
  try {
    const u = new URL(base);
    return `${u.origin}/`;
  } catch {
    return null;
  }
}

// The link for a Claude app session: the app itself on the Mac it runs on, the board's panel for it elsewhere.
export function sessionLink(host, sid, { board, here }) {
  if (!SESSION.test(sid ?? '')) return board ? `${board}#sessions` : null;
  if (host && host === here) return `claude://code/continue?session=${sid}`;
  return board ? `${board}#sessions/${sid}` : null;
}

// The link one event opens, or null for one that posts no banner or has nowhere to go.
export function eventUrl(e, { board, here, repo = null } = {}) {
  if (SOUND_ONLY.has(e.kind)) return null;
  const [type, a, b] = String(e.key ?? '').split(':');
  if (e.kind === 'mainRed') {
    if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/.test(e.run ?? '')) return e.run;
    if (/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) return `https://github.com/${repo}/actions?query=branch%3Amain`;
    return board ? `${board}#sec-needs` : null;
  }
  if (type === 'session') return sessionLink(a, b, { board, here });
  if (!board) return null;
  if ((type === 'down' || type === 'paused') && HOST.test(a ?? '')) return `${board}#fleet/${a}`;
  if (['blocked', 'ask', 'merge-ask', 'stuck', 'ci'].includes(type) && TICKET.test(a ?? '') && e.who?.id) return `${board}#session=${a}`;
  return `${board}#sec-needs`;
}
