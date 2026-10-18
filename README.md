# git-backstory

[![npm](https://img.shields.io/npm/v/git-backstory)](https://www.npmjs.com/package/git-backstory)
[![CI](https://github.com/hexmillionaire/git-backstory/actions/workflows/ci.yml/badge.svg)](https://github.com/hexmillionaire/git-backstory/actions/workflows/ci.yml)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)
[![license](https://img.shields.io/npm/l/git-backstory)](LICENSE)

**The backstory of a file, in one page, for whoever has to change it next.**

```bash
npx git-backstory src/billing/invoice.ts
```

`git blame` tells you who. `git log` tells you when. Neither tells you that the rounding change was reverted twice, that this file never changes without `invoice.test.ts`, or that someone wrote "must be applied before rounding, otherwise totals drift" in a commit body three years ago. git-backstory reads the history and writes that down in a page of markdown.

Zero dependencies. Runs `git log` and `git blame` only. Never writes to your repo, never touches the network, no API key.

---

## Who it's for

**Coding agents.** Claude Code, Cursor, Codex and friends read the current code and nothing else. They don't know a change was tried and reverted, so they try it again. Run git-backstory on the file before editing and paste the brief in, or install the [skill](#let-your-agent-run-it) and let the agent do it.

**You, on a file you didn't write.** Before touching the scary file, read its brief. Takes a second to generate and a minute to read.

**Reviewers.** `git-backstory path/to/file:120-160` on the lines a PR touches tells you whether those lines have a history of trouble.

---

## Example

Run on the navbar of a Next.js app:

```markdown
# History brief: `src/components/navbar.tsx`

22 commits · first 2026-03-26 (7 months ago) · last 2026-10-08 (10 days ago) · 2 authors · 139 lines now

## Be careful

- Fix-shaped commits (8): `41a3ae1` "feat: fix reading on a phone"; `2722d44` "fix: use Clerk
  useUser() for UI auth gating to break auth loop"; `b24e8cc` "fix: resolve Convex-Clerk auth
  integration and add logout button"; …

## Reasons on record

- Geist fonts from node_modules so builds never fetch Google Fonts — `a77be23`, 2026-10-08

## Usually changes together with

- `src/app/bible/[book]/[chapter]/chapter-reader.tsx` — 10 of the sampled commits (45%)
- `src/app/layout.tsx` — 9 of the sampled commits (41%)
- `src/app/login/page.tsx` — 7 of the sampled commits (32%)

If you change this file, check whether those need the same change.

## Who to ask

Current lines by author: hexmillionaire 65%, Amado 35%.

## Timeline

- 2026-10-08 `a77be23` Extract Vibe Stack: Next.js + Convex + Clerk starter kit — Amado
- 2026-08-31 `41a3ae1` feat: fix reading on a phone — hexmillionaire
- 2026-03-28 `2722d44` fix: use Clerk useUser() for UI auth gating to break auth loop — hexmillionaire
…
```

When the remote is on GitHub, GitLab or Bitbucket, hashes and `#123` references become links.

## What it looks for

| Section | Source | Shows up when |
|---|---|---|
| **Be careful** | Reverts (`This reverts commit…` or `Revert "…"`), fix-shaped subjects, bursts of commits around a fix | There is a revert, a fix, or a cluster of attempts |
| **Reasons on record** | Commit bodies: sentences with *because*, *must*, *never*, *otherwise*, *so that*… | An author explained a constraint |
| **Usually changes together with** | Files changed in the same commits, ≥30% of the time | The file has coupling worth knowing about |
| **Referenced issues and PRs** | `#123` / `GH-123` in subjects and bodies | Any are present |
| **Who to ask** | `git blame` ownership of the current lines | Always, for tracked files |
| **Timeline** | Notable commits plus the most recent ones, newest first | Always |

Sections with nothing to say are omitted, so a quiet file gets a quiet brief.

---

## Usage

```bash
npx git-backstory <path>              # brief for a file
npx git-backstory <path>:<line>       # one line
npx git-backstory <path>:<from>-<to>  # a line range (uses git log -L)
npx git-backstory <path> --json       # the facts as JSON
npx git-backstory <path> --out BRIEF.md
npx git-backstory <path> --since "6 months ago"
npx git-backstory <path> --max 500    # sample more than 200 commits
npx git-backstory <path> --no-links   # plain hashes
```

Requires Node 18+ and git. Paths can be relative to your current directory or absolute; the brief is for the repository that contains them. Renames are followed, and the brief lists the file's previous paths.

---

## Let your agent run it

**Claude Code:** install the skill once; the agent then runs a brief before editing files with history.

```bash
mkdir -p ~/.claude/skills/git-backstory
curl -fsSL https://raw.githubusercontent.com/hexmillionaire/git-backstory/main/skills/git-backstory/SKILL.md \
  -o ~/.claude/skills/git-backstory/SKILL.md
```

**Anything else:** add a line to your `CLAUDE.md`, `AGENTS.md` or rules file:

> Before changing a file with more than a handful of commits, run `npx -y git-backstory <path>` and read the "Be careful" and "Usually changes together with" sections.

Agents looking for a summary of this tool can read [`llms.txt`](llms.txt).

---

## Why

The most expensive bugs in a codebase are the ones that were already fixed once. The fix is in the history, the reason is in a commit body, and nobody reads either before changing the code, least of all an agent that only sees the working tree. git-backstory makes that history cheap to read: one command, one page, the parts that matter first.

It is deliberately heuristic. "Fix-shaped" means the subject says fix, regression, revert, broke or similar; "reasons" means sentences that sound like constraints. It will miss some and over-include others. Read the brief like a colleague's notes, not a verdict.

## Safety

Runs `git log`, `git blame`, `git show`, `git ls-files`, `git rev-parse` and `git remote get-url`. All reads. It never executes project code and never makes network requests. Commit messages and author names from the repository appear in the output, so review a brief before sharing it outside the team. See [SECURITY.md](SECURITY.md).

## Related

- [claude-md-generator](https://github.com/hexmillionaire/claude-md-generator) — `npx claude-md-generator` drafts the CLAUDE.md your agent reads every session.
- [Agent Lanes](https://github.com/hexmillionaire/agent-lanes) — keep an agent's task inside its declared file scope, then hand it off.

## License

MIT
