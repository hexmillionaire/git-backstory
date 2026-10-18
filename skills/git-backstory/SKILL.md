---
name: git-backstory
description: Run a one-page git backstory on a file before changing it — reverts, fix bursts, reasons from commit bodies, files that change together. Use before editing any file with real history, when a task says "careful", or when a change you are about to make feels like it may have been tried before.
---

# git-backstory

A file's history says what not to do. This skill reads it in one command before you edit.

## When

- Before editing a file with more than ~5 commits, or one the user calls fragile, legacy or "the scary one".
- Before re-implementing something that looks like it should already exist.
- When a PR touches lines you don't understand: brief the range.

## Steps

1. Run `npx -y git-backstory <path>` (or `<path>:<from>-<to>` for a range). It needs git and Node 18+; nothing is installed into the repo.
2. Read **Be careful** first. If a revert is listed, open both commits (`git show <hash>`) and understand why before attempting anything similar. If there is a fix burst, assume the area is subtle.
3. Read **Usually changes together with**. When you change this file, check each listed file for the same change, and mention the ones you deliberately left alone.
4. Read **Reasons on record**. These are constraints the authors wrote down; treat them as requirements unless the user overrides them.
5. Make the change. In your summary to the user, cite the relevant brief lines in one sentence ("the rounding change was reverted in `b8bc09f`, so I kept rounding out of `price()`").

## Notes

- Heuristic by design: "fix-shaped" means the subject says fix/regression/revert/broke; "reasons" means sentences with because/must/never/otherwise. Use judgment.
- Pass `--json` when you want to filter the facts yourself.
- Commit messages and author names appear in the output; don't paste a brief from a private repo into a public place.
