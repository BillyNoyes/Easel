export function releaseMetadata(metadata, ref) {
  if (metadata.name !== 'vite-plugin-shopify-easel' || metadata.private === true) {
    throw new Error('Releases must publish the public vite-plugin-shopify-easel package');
  }
  if (metadata.repository?.url !== 'git+https://github.com/BillyNoyes/Easel.git') {
    throw new Error('The package repository must match the trusted publisher');
  }

  const version = metadata.version;
  const match =
    typeof version === 'string' &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(
      version,
    );
  if (!match) {
    throw new Error(
      'Release versions must be stable or numbered alpha, beta, or rc versions',
    );
  }
  if (ref !== `refs/tags/v${version}`) {
    throw new Error(`Release tag must be v${version}, matching package.json`);
  }

  return {version, distTag: match[4] ?? 'latest'};
}
