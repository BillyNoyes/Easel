# Releasing Easel

Releases of `vite-plugin-shopify-easel` use `.github/workflows/release.yml` and npm trusted publishing. Do not add an npm publishing token to GitHub secrets.

## Scaffolder release boundary

`create-easel`, in `packages/create-easel`, is a separate, currently unpublished npm package. The plugin's `v*` tags and release workflow do not publish it. Its npm bootstrap, trusted publisher, and release workflow still need to be configured before its first public release.

Before publishing the scaffolder, run the full repository checks, including the packed CLI's 16 generated-project combinations. Review the pinned dependency versions in `packages/create-easel/src/project.ts`, particularly the published Easel version. Pack from the scaffolder directory, not the repository root. Publish prereleases under `beta`; do not advertise an `@latest` command until a stable CLI exists.

## One-time setup

The package must exist on npm before connecting its trusted publisher. In the settings for `vite-plugin-shopify-easel`, add a GitHub Actions trusted publisher:

| Setting              | Value         |
| -------------------- | ------------- |
| Organization or user | `BillyNoyes`  |
| Repository           | `Easel`       |
| Workflow filename    | `release.yml` |
| Environment          | `npm`         |

If npm presents an allowed-actions setting, allow direct publishing with `npm publish`, not only staged publishing. The workflow filename includes the extension but not `.github/workflows/`.

The GitHub `npm` environment must require approval from Billy Noyes, allow the initiator to approve, disable administrator bypass, and allow only tags matching `v*`. Allowing the initiator to approve is necessary for a single-maintainer release process.

After verifying the first trusted publish, restrict traditional token publishing in npm's package settings. Browser authentication and 2FA remain under the package owner's control.

## Prepare a release

Start with a clean checkout of `main`:

```sh
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
npm version 0.1.0 --no-git-tag-version
pnpm check

git add package.json
git commit -m "Release 0.1.0"
git push origin main
```

Use the intended version in place of `0.1.0`. Wait for CI to pass on that commit, then create and push its matching tag:

```sh
git tag -a v0.1.0 -m "Easel v0.1.0"
git push origin v0.1.0
```

Tag only versions that have not already been published. npm versions are immutable. Do not move or reuse a release tag.

## Approve publication

Open the **Release** workflow in GitHub Actions. It checks that the tag matches `package.json`, that the package and repository are correct, and that the commit belongs to `main`.

The workflow then runs the full Linux, macOS, Windows, Vite 7/8, and Shopify Theme Check matrix. It builds and smoke-tests the package, uploads a release tarball, and waits for approval of the `npm` environment.

Review the version and commit, then approve **Publish to npm**. The publish job downloads the prepared tarball without checking out source or running package lifecycle scripts. It uses OIDC and publishes provenance. A separate job creates the GitHub release with generated notes.

Stable versions use npm's `latest` tag. Numbered prereleases such as `0.2.0-alpha.1`, `0.2.0-beta.1`, and `0.2.0-rc.1` use `alpha`, `beta`, and `rc`, respectively, and create GitHub prereleases rather than replacing the latest stable release.

## Verify

```sh
npm view vite-plugin-shopify-easel@0.1.0 version dist.attestations \
  --registry=https://registry.npmjs.org
npm dist-tag ls vite-plugin-shopify-easel \
  --registry=https://registry.npmjs.org
```

Check that the npm package page displays provenance and that the GitHub release points to the intended tag.

If a workflow fails before publishing, fix the cause and rerun the failed jobs. If npm published successfully but GitHub release creation failed, rerun only that failed job. A manual workflow dispatch must target an existing version tag, not `main`.
