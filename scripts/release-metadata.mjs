const repository = 'git+https://github.com/BillyNoyes/Easel.git';

export function releaseMetadata(metadata, ref, createMetadata) {
  if (metadata.name !== 'vite-plugin-shopify-easel' || metadata.private === true) {
    throw new Error('Releases must publish the public vite-plugin-shopify-easel package');
  }
  if (metadata.repository?.url !== repository) {
    throw new Error('The plugin repository must match the trusted publisher');
  }
  if (!createMetadata) {
    throw new Error('Release metadata must include create-easel-theme');
  }
  if (createMetadata.name !== 'create-easel-theme' || createMetadata.private === true) {
    throw new Error('Releases must publish the public create-easel-theme package');
  }
  if (
    createMetadata.repository?.url !== repository ||
    createMetadata.repository?.directory !== 'packages/create-easel'
  ) {
    throw new Error('The generator repository must match the trusted publisher');
  }
  if (createMetadata.bin?.['create-easel-theme'] !== 'bin/create-easel-theme.mjs') {
    throw new Error('The generator executable must be create-easel-theme');
  }
  if (createMetadata.version !== metadata.version) {
    throw new Error('The plugin and generator versions must match');
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
