# Releasing Easel

Releases of `vite-plugin-shopify-easel` and `create-easel-theme` use `.github/workflows/release.yml` and npm trusted publishing. Both packages share a version and release tag. Do not add an npm publishing token to GitHub secrets.

## Coupled release boundary

The workflow validates, packs, and publishes both public packages. It publishes the plugin first so newly generated themes can resolve the matching `vite-plugin-shopify-easel` version, then publishes the generator. Run the full repository checks before tagging, including the packed CLI's 16 generated-project combinations.

## One-time setup

Both packages must configure a GitHub Actions trusted publisher with the same settings:

| npm package                 | Organization or user | Repository | Workflow filename | Environment |
| --------------------------- | -------------------- | ---------- | ----------------- | ----------- |
| `vite-plugin-shopify-easel` | `BillyNoyes`         | `Easel`    | `release.yml`     | `npm`       |
| `create-easel-theme`        | `BillyNoyes`         | `Easel`    | `release.yml`     | `npm`       |

If npm presents an allowed-actions setting, allow direct publishing with `npm publish`, not only staged publishing. The workflow filename includes the extension but not `.github/workflows/`.

The GitHub `npm` environment must require approval from Billy Noyes, allow the initiator to approve, disable administrator bypass, and allow only tags matching `v*`. Allowing the initiator to approve is necessary for a single-maintainer release process.

After verifying the first trusted publish, restrict traditional token publishing in npm's package settings. Browser authentication and 2FA remain under the package owner's control.

## Prepare a release

`main` is protected: changes land through a pull request whose CI checks pass, and the rule applies to administrators too. Start a release branch from a clean, current `main`:

```sh
git switch main
git pull --ff-only
git switch -c release/0.2.1
pnpm install --frozen-lockfile
npm version 0.2.1 --no-git-tag-version
npm --prefix packages/create-easel version 0.2.1 --no-git-tag-version
```

Then update every remaining reference to the previous version. They pin the generated plugin version in `packages/create-easel/src/project.ts`, the scaffolded `theme_version`, the generator README, the site's structured data, and the tests and package checks that assert them. `git grep` lists them:

```sh
git grep -n "<previous version>" -- . ':!pnpm-lock.yaml' ':!RELEASING.md'
pnpm check

git commit -am "Release 0.2.1"
git push -u origin release/0.2.1
gh pr create --base main --title "Release 0.2.1" --fill
```

Use the intended version in place of `0.2.1`. Merge the pull request once CI passes, then tag the merge commit on `main`:

```sh
git switch main
git pull --ff-only
git tag -a v0.2.1 -m "Easel v0.2.1"
git push origin v0.2.1
```

Tag only versions that have not already been published. npm versions are immutable. Do not move or reuse a release tag.

## Approve publication

Open the **Release** workflow in GitHub Actions. It checks that the tag matches both package versions, that both package identities and repositories are correct, and that the commit belongs to `main`.

The workflow then runs the full Linux, macOS, Windows, Vite 7/8, and Shopify Theme Check matrix. It builds and smoke-tests both packages, uploads both release tarballs, and waits for approval of the `npm` environment.

Review the version and commit, then approve the plugin and generator publication jobs as they become ready. Each job downloads only the prepared artifacts without checking out source or running package lifecycle scripts. The plugin publishes first; the separately retryable generator job follows. Both use OIDC and provenance. A final job creates the GitHub release with generated notes.

Stable versions use npm's `latest` tag. Numbered prereleases such as `0.2.0-alpha.1`, `0.2.0-beta.1`, and `0.2.0-rc.1` use `alpha`, `beta`, and `rc`, respectively, and create GitHub prereleases rather than replacing the latest stable release.

## Verify

```sh
npm view vite-plugin-shopify-easel@0.2.1 version dist.attestations \
  --registry=https://registry.npmjs.org
npm view create-easel-theme@0.2.1 version dist.attestations \
  --registry=https://registry.npmjs.org
npm dist-tag ls vite-plugin-shopify-easel --registry=https://registry.npmjs.org
npm dist-tag ls create-easel-theme --registry=https://registry.npmjs.org
```

Check that the npm package page displays provenance and that the GitHub release points to the intended tag.

If a workflow fails before publishing, fix the cause and rerun the failed jobs. The publication jobs are separate so a generator failure can be retried without attempting to republish an immutable plugin version. If both npm packages published successfully but GitHub release creation failed, rerun only that failed job. A manual workflow dispatch must target an existing version tag, not `main`.
