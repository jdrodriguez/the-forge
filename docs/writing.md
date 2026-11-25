# Writing

How the docs, briefs and comments in this repo are written. Agents write most of it, and agents left alone write too much. These rules keep it reading like a person wrote it.

## Who you're writing for

Someone who just found the repo and wants to run it, change it, or fix it. They read the first lines of a section and skim the rest. Give them what they need in the order they need it: what it is, how to use it, how to configure it, then how it works.

## Rules

- **Say it once.** Each fact lives in one place, the place a reader would look for it. Everywhere else, link to it.
- **Describe how it works now.** Leave out when a feature was added, who asked for it, what broke last week and how it was checked. That belongs in commit messages and pull requests. If the reason behind a rule still matters, put it in `docs/decisions.md`.
- **Short sentences, everyday words.** A paragraph makes one point. If a sentence needs two commas and a parenthesis, split it.
- **Be concrete.** Name the file, the command, the config key and its default.
- **Lists and tables for reference** (flags, keys, files, states). Prose for explaining how something works.
- **Cut filler.** If deleting a sentence loses nothing, delete it. That includes "Note that", "It's worth noting", "importantly", restating a point for emphasis, and summaries of what was just said.
- **No em dashes** and no "this is X, not Y" setups. Use a period, a comma or a colon.
- **Don't sell.** No "powerful", "seamless" or "robust". Say what it does.
- **Bold sparingly.** A bold lead-in on every bullet is noise.

## Lengths

- The top README: what The Forge is, the loop, what's in the repo, how to set it up. A few screens.
- A folder README: what's in the folder, how to run it, how to configure it, and the behavior someone needs to predict it. Edge cases and internals go in code comments next to the code they explain.
- A code comment: why the code does this, in a line or two. Don't narrate history or restate what the code says.
- A brief or skill an agent reads: every rule it must follow, once, in the order it needs them. Agents pay for every word on every run.

## When you shorten something

Never drop a command, config key, default, file name, path, label or rule that someone needs. If you aren't sure whether a detail matters, keep it and make it shorter.
