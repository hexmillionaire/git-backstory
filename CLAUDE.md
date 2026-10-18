# git-backstory — agent notes

Zero-dependency Node CLI. Reads `git log`/`git blame` for one file and renders a short markdown brief. ESM, Node 18+.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (`test/analyze.test.js`) and CLI tests against a real temp git repo (`test/cli.test.js`) |
| `npm run try` | Run the tool on its own `src/cli.js` |
| `node bin/git-backstory.js <path> --json` | See the raw facts when a section looks wrong |

**Before saying "done":** `npm test`, then run the tool on a real file in another repo and read the brief as a user would.

## Layout

| Path | What's there |
|---|---|
| `src/git.js` | The only file that runs git. Every command is a read. |
| `src/analyze.js` | Pure: commits in, facts out. All heuristics live here. |
| `src/render.js` | Pure: facts in, markdown out. |
| `src/cli.js` | Args, path/range parsing, wiring, exit codes |
| `test/fixture.js` | Builds the story repo (revert, fix burst, co-change, rename) the CLI tests use |

## Invariants that are easy to break

**Zero runtime dependencies and read-only git.** `src/git.js` never runs a write command. If a feature needs a package or a write, it doesn't ship.

**`analyze()` and `render()` stay pure.** No git, no fs, no clock except the injected `now`. That is what makes the heuristics testable with hand-built commit objects.

**The brief stays short and omits empty sections.** A typical file should render under ~60 lines. `test/analyze.test.js` asserts a one-commit file renders under 20 lines; keep that test honest rather than relaxing it.

**Line-range briefs cannot use `--follow`.** git forbids `-L` with `--follow`, so `rangeLog` has no rename trail and no co-change data; the renderer must tolerate `files: []`.

**`--name-status` is collected in a second `--no-walk` pass.** With a pathspec, `git log --name-only` lists only the followed file, so co-change needs the separate call in `fileLog`. Don't "simplify" it back into one command.

## Where things go

| Need | Do |
|---|---|
| A new signal (e.g. detect squash-merged PR titles) | Add it in `analyze()`, return it in the facts object, render it in `render.js`, expose it in `toJson()` in `cli.js`, test it with hand-built commits |
| A new word that marks a "fix" or a "reason" | `FIX_RE` / `CONSTRAINT_RE` in `src/analyze.js` |
| A new remote host for links | The regex in `remoteWebUrl()` in `src/git.js` |
| A new flag | `parseArgs()` and `HELP` in `src/cli.js`, then a case in `test/cli.test.js` |
