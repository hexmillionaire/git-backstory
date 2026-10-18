# Changelog

## 0.1.0

- First release: file and line-range briefs from `git log` and `git blame`.
- Detects reverts (by hash and by subject), fix-shaped commits, fix bursts, co-changed files, issue/PR references, constraints quoted from commit bodies, line ownership and rename trails.
- `--json`, `--since`, `--max`, `--out`, `--no-links`. Web links for GitHub, GitLab and Bitbucket remotes.
- Zero dependencies, Node 18+. Agent skill and `llms.txt` included.
