# Security

Report vulnerabilities through GitHub's [private vulnerability reporting](https://github.com/hexmillionaire/git-backstory/security/advisories/new). Please don't open a public issue with exploit details.

## What this tool does and doesn't do

- **Reads git history only.** It runs `git log`, `git blame`, `git show`, `git ls-files`, `git rev-parse` and `git remote get-url` against the repository containing the path you give it. All of these are reads; it never commits, checks out, fetches or pushes.
- **Never executes project code.** It does not import, require or run anything from the repository, and it makes no network requests. Web links in the output are built from the `origin` remote URL as text.
- **Treats the repository's own git config as untrusted.** A `.git/config` (which `git clone` does not transfer, but a zip, tarball or shared drive does) can name programs in `core.fsmonitor`, `core.hooksPath`, `core.pager`, `diff.external`, textconv drivers, `core.sshCommand` or `gpg.program`. Every git call overrides all of those on the command line, `git blame` runs with `--no-textconv`, and `GIT_*` environment variables are dropped before spawning git, so the only program this tool ever starts is `git`.
- **Writes nothing** unless you pass `--out <file>`, and then only that file.
- **Zero runtime dependencies**, so there is no transitive supply chain to audit.

## What ends up in a brief

Commit subjects, commit body excerpts, author names, dates, hashes and file paths from the repository. That is the point of the tool, but it means a brief from a private repository can contain names and internal references. Review it before posting it anywhere outside the people who can already read the repository.
