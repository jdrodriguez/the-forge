#!/usr/bin/env python3
"""send.py: types a message into one worker session on this machine, for the queue board.

    python3 send.py <account label> <worker id>    (the message comes on stdin)

It opens the session with `claude attach` in a pseudo-terminal, pastes the message, presses Enter and closes the
attach client; the session keeps running. The message arrives as the human's own turn, the same as typing it after
`claude attach`. A worker that is blocked on a prompt is refused, since Enter would answer that prompt. Prints JSON.
"""
import fcntl, glob, json, os, pty, re, select, signal, struct, subprocess, sys, termios, time
from datetime import datetime, timezone

label, worker = (sys.argv[1:3] + [None, None])[:2]
if not label or not re.fullmatch(r'[a-z]', label) or not worker or not re.fullmatch(r'[0-9a-f]{8}', worker):
    sys.exit('usage: send.py <account label> <worker id>')

HOME = os.path.expanduser('~')
ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))


def primary_account():
    """The fleet account whose config dir is ~/.claude (fleet.primaryAccount in this machine's config)."""
    try:
        out = subprocess.run(['node', os.path.join(ROOT, 'lib', 'config.mjs'), 'get', 'fleet.primaryAccount'],
                             capture_output=True, text=True, timeout=20)
        return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else 'a'
    except Exception:
        return 'a'


PRIMARY = primary_account()
ACCT = os.path.join(HOME, '.claude') if label == PRIMARY else os.path.join(HOME, '.claude-' + label)
env = dict(os.environ, TERM='xterm-256color')
if label == PRIMARY:
    env.pop('CLAUDE_CONFIG_DIR', None)

else:
    env['CLAUDE_CONFIG_DIR'] = ACCT


def done(ok, **kw):
    print(json.dumps(dict(ok=ok, **kw)))
    sys.exit(0)


# Control characters other than newline and tab could drive the terminal UI, so they go.
text = re.sub(r'[\x00-\x08\x0b-\x1f\x7f]', '', sys.stdin.read().replace('\r\n', '\n')).strip()
if not text:
    done(False, error='empty message')
if len(text) > 8000:
    done(False, error='message is over 8000 characters')

try:
    agents = json.loads(subprocess.run(['claude', 'agents', '--json', '--all'], env=env, cwd=HOME,
                                       capture_output=True, text=True, timeout=30).stdout or '[]')
except Exception as e:
    done(False, error='could not list sessions: %s' % e)
me = next((a for a in agents if str(a.get('id', '')).startswith(worker) or str(a.get('sessionId', '')).startswith(worker)), None)
if not me:
    done(False, error='no session %s on account %s here' % (worker, label))
state = me.get('state') or me.get('status') or 'unknown'
if state == 'blocked':
    done(False, state=state, error='the worker is waiting on a prompt in its session; answer it there, since Enter would pick an option')

started = datetime.now(timezone.utc)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(HOME)
    os.execvpe('claude', ['claude', 'attach', worker], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 160, 0, 0))

screen = b''


def pump(max_secs, quiet=None):
    """Reads output for up to max_secs; with quiet, stops once the screen has been still that long."""
    global screen
    end, last = time.time() + max_secs, time.time()
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                return False
            if not chunk:
                return False
            screen += chunk
            last = time.time()
        elif quiet and screen and time.time() - last >= quiet:
            return True
    return True


def plain():
    s = re.sub(rb'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[=>()][0-9A-B]?', b'', screen)
    return s.decode('utf8', 'replace')


def close():
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(20):
            if os.waitpid(pid, os.WNOHANG)[0]:
                return
            time.sleep(0.1)
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
    except (ProcessLookupError, ChildProcessError):
        pass


alive = pump(15, quiet=1.5)
if not alive or os.waitpid(pid, os.WNOHANG)[0]:
    done(False, state=state, error='attach ended before the message was typed: ' + plain()[-300:].strip())
os.write(fd, b'\x1b[200~' + text.encode() + b'\x1b[201~')
pump(1.0)
os.write(fd, b'\r')
pump(2.5)
close()

# Look for the message in the transcript. An idle worker shows it at once; a busy one takes it at its next step.
snippet = re.sub(r'\s+', ' ', text)[:60]
files = sorted(glob.glob(os.path.join(ACCT, 'projects', '*', worker + '*.jsonl')), key=os.path.getmtime)
delivered = False
deadline = time.time() + 6
while files and time.time() < deadline and not delivered:
    with open(files[-1], 'rb') as f:
        f.seek(max(0, os.path.getsize(files[-1]) - 512 * 1024))
        for line in f.read().decode('utf8', 'replace').splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if e.get('type') != 'user' or not e.get('timestamp'):
                continue
            if datetime.fromisoformat(e['timestamp'].replace('Z', '+00:00')) < started:
                continue
            c = e.get('message', {}).get('content')
            body = c if isinstance(c, str) else ' '.join(b.get('text', '') for b in (c or []) if isinstance(b, dict))
            if snippet in re.sub(r'\s+', ' ', body):
                delivered = True
                break
    if not delivered:
        time.sleep(1)
done(True, state=state, delivered=delivered)
