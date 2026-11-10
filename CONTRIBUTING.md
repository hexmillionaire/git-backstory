# Contributing

`npm test` runs everything; the CLI tests build a real git repository in a temp directory, so git must be installed. Node 18, 20, 22 and 24 are tested in CI on Linux, plus Windows and macOS on 22.

Keep it zero-dependency and read-only: no packages, no git commands that write. New heuristics go in `src/analyze.js` with a unit test in `test/analyze.test.js`; anything that needs real git goes in `test/fixture.js` and `test/cli.test.js`. The brief should stay under about 60 lines for a typical file, so a new section has to earn its place.

## Releasing

Releases are published by `.github/workflows/publish.yml`, never from a laptop.

1. In a PR, bump `version` in `package.json` and rename `## Unreleased` in `CHANGELOG.md` to `## <version> — <date>`. Merge it.
2. Tag the merge commit on `main` and push the tag:

   ```bash
   git tag v<version> origin/main && git push origin v<version>
   ```

The workflow refuses a tag that does not match `package.json`, has no changelog section, or is not on `main`. It runs the tests, then publishes with npm trusted publishing (GitHub OIDC, no stored token) and a provenance attestation.
