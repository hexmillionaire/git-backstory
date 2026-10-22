# Changelog

## Unreleased

- Security: the repository being read can no longer make the tool run programs. Every git call now overrides `core.fsmonitor`, `core.hooksPath`, `core.pager`, `diff.external`, `core.sshCommand`, `gpg.program`, credential and proxy helpers on the command line, `git blame` passes `--no-textconv`, and `GIT_*` variables are scrubbed from the child environment (`GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`). Previously a `.git/config` delivered inside a zip, tarball or shared checkout could name a command in `core.fsmonitor` and have it executed during `git ls-files`.

## 0.1.0

- First release: file and line-range briefs from `git log` and `git blame`.
- Detects reverts (by hash and by subject), fix-shaped commits, fix bursts, co-changed files, issue/PR references, constraints quoted from commit bodies, line ownership and rename trails.
- `--json`, `--since`, `--max`, `--out`, `--no-links`. Web links for GitHub, GitLab and Bitbucket remotes.
- Zero dependencies, Node 18+. Agent skill and `llms.txt` included.
