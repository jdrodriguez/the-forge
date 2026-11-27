// QUEUE_BOARD_DRY=1 makes a board refuse every POST, so a copy run to try a board change sends no message to a worker,
// opens no terminal, marks nothing handled and changes no sound setting. Every GET still answers, so every view draws.
export const dryRun = (env = process.env) => env.QUEUE_BOARD_DRY === '1';
export function dryRefusal(method, env = process.env) {
  if (!dryRun(env) || method !== 'POST') return null;
  return { status: 403, body: { ok: false, error: 'This is a dry-run board (QUEUE_BOARD_DRY=1): nothing was sent' } };
}
