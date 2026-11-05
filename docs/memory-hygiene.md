# Memory hygiene policy

A Claude Code memory store (a project's `memory/` folder, for example `~/.claude/projects/<project>/memory/`, shared by every session, account and fleet worker that works in the project) is context that every session pays for. Its index, `MEMORY.md`, loads into every session in the workspace, and each memory a session opens costs tokens again. A memory that is stale, duplicated or oversized makes every session slower and less accurate, and the cost compounds because nobody notices it. This policy keeps the store small and true.

Below, `<memory>` is that folder. When several machines share one store, keep it in a folder a sync tool (Syncthing, Dropbox) keeps in step, and point each machine's project `memory/` at it with a symlink.

An audit script is not part of this repo. If you write one, have it check the budgets below, list every offender, and exit non-zero when any budget is exceeded, so a scheduled run can alert on it.

## Budgets

| What | Budget | Why |
|---|---|---|
| One memory file | 3 KB | A memory holds one fact, its why, and how to apply it. Anything longer is history or a doc. |
| `MEMORY.md` | 200 lines and 25 KB | The loader truncates the index past these limits, so lines past them silently vanish. |
| Each `hub_*.md` | 16 KB | Hubs are loaded on demand; past this they cost as much as the index they relieve. |
| Orphans (memories no index links to) | 0 | An unlinked memory is never found, so it either gets linked or archived. |
| `~/.claude/CLAUDE.md` | its size when you adopt this policy | Ratchet this down as the file slims. Never raise it to make a breach pass. |
| Always-loaded context for a workspace session | 80 KB to start, target 60 KB | `~/.claude/CLAUDE.md` + `MEMORY.md` + every `~/.claude/rules/*.md` without `paths:` frontmatter + the workspace's own `CLAUDE.md`. Report the built repo's `CLAUDE.md` separately. |

Worth reporting without failing on them: memories not modified or verified in 90 days, near-duplicate descriptions, `feedback_*` memories with no enforcement line, and `[[wikilinks]]` that resolve to nothing.

## What goes in memory at all

A memory is the last and most temporary rung of the enforcement ladder. Before saving a lesson, put it in the cheapest form that enforces it, in this order:

1. Make the mistake impossible (types, a shared helper, a script that owns the operation).
2. A lint rule or a test.
3. A hook (Claude Code `settings.json`, git hooks).
4. A step in a worker brief or a skill.
5. A rule in a doc (CLAUDE.md, `~/.claude/rules/`, a reference file).
6. A memory, only while the pattern is still emerging.

Add a rule after the second miss. A one-off lesson stays a memory. Two or more memories on the same topic means the topic belongs in a doc.

Do not save what the repo, git history or a doc already records.

The weekly failure sweep (`learning/README.md`) applies the same ladder to repeated CI, review and dispatcher failures, and with `learning.correctionsGlob` set it counts new and changed feedback memories as corrections.

## Conventions

**Frontmatter.** Every memory has `name`, `description` and `metadata.type`. Optional `metadata` keys:

- `last_verified: YYYY-MM-DD`: the date someone checked the memory's factual claims against the live system (code, config, a service). Set it only when you actually checked. An audit uses it in place of the file's modified time for staleness.
- `enforcement: <layer>`: same as the body line below.

**Enforcement line.** Every `feedback_*` memory carries a body line naming where the lesson is enforced, for example `**Enforcement:** hook (never-rules-guard.sh)` or `**Enforcement:** doc only; candidate: CI check that fails a PR body without a Fix: line`. A memory that has graduated leads with `**Canonical doc:** <path> § <section>` instead.

**Indexing.** Every memory is linked from `MEMORY.md` (one line per memory: a link to the file and a short hook) or from exactly one `hub_*.md`, which `MEMORY.md` links. Hooks stay under about 150 characters.

**Archive.** Archiving moves the file into `<memory>/_archive/<YYYY-MM-DD>/`; nothing is deleted. Each archive folder has an `ARCHIVE-LOG.md` table: file, reason, superseded by. Trimmed memories keep their full original under `_archive/<date>/trimmed/`. Remove the archived file's index line in the same change. To restore, move the file back and re-add its index line. An audit ignores everything under `_archive/`.

## Verdicts for a pass

Every memory gets exactly one:

| Verdict | When | Action |
|---|---|---|
| keep | True, useful, under budget, no overlap | Link it if it is an orphan. Add `last_verified` if you checked it. |
| merge | Same topic as another memory | Fold the unique facts into the broader or newer memory, archive the other. |
| graduate | Two or more memories on the topic, or a doc already states the rule | Put the rule in the doc; leave a memory whose body leads with `**Canonical doc:**` and a pointer, or archive it when the doc fully covers it. |
| trim | Useful but over 3 KB | Cut history, incident narrative and long evidence; keep the rule, why, and how to apply. Original goes to `_archive/<date>/trimmed/`. |
| verify | Its value rests on a factual claim (a path, a script, a config value, a service state) | Check it against the live system; then keep with `last_verified`, fix it, or archive it. |
| archive | Superseded by a newer memory, describes a system that no longer exists, an exact duplicate, contradicted by the live code or config, or a one-off session log | Move to `_archive/`, log it. |

Archive only clear-cut cases. Anything that needs judgment goes on a list for the human (`human.name` in the config) with a one-line reason and a recommendation.

## Cadence

- **Weekly:** run the audit. A non-zero exit is the signal; fix orphans and oversize files on the spot, and report budget breaches.
- **Monthly:** a full pass with the verdicts above, starting from the audit's output.
- **After a model upgrade:** re-read the feedback memories and retire the ones a newer model no longer needs.
- **When a check lands:** retire the memory (or reduce it to a `**Canonical doc:**` pointer) once a lint rule, test, hook or brief step enforces it. Confirm the failure stopped recurring (the failure sweep's "Did the fix hold?" check) before deleting the check's doc trail.
