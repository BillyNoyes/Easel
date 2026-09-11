import {describe, expect, it} from 'vitest';
import {releaseMetadata as validateReleaseMetadata} from '../scripts/release-metadata.mjs';

const metadata = {
  name: 'vite-plugin-shopify-easel',
  version: '0.1.0',
  repository: {url: 'git+https://github.com/BillyNoyes/Easel.git'},
};
const createMetadata = {
  name: 'create-easel-theme',
  version: '0.1.0',
  repository: {
    url: 'git+https://github.com/BillyNoyes/Easel.git',
    directory: 'packages/create-easel',
  },
  bin: {'create-easel-theme': 'bin/create-easel-theme.mjs'},
};
const releaseMetadata = (plugin, ref, generator) =>
  validateReleaseMetadata(plugin, ref, {
    ...createMetadata,
    version: plugin.version,
    ...generator,
  });

describe('release metadata', () => {
  it.each([
    ['0.1.0', 'latest'],
    ['1.20.300', 'latest'],
    ['0.2.0-alpha.0', 'alpha'],
    ['0.2.0-beta.1', 'beta'],
    ['1.0.0-rc.12', 'rc'],
  ])('publishes %s with the %s dist-tag', (version, distTag) => {
    expect(releaseMetadata({...metadata, version}, `refs/tags/v${version}`)).toEqual({
      version,
      distTag,
    });
  });

  it.each([
    '',
    'v0.1.0',
    '01.0.0',
    '1.0.0-beta.01',
    '1.0.0-beta',
    '1.0.0-bet.1',
    '1.0.0+build',
    '1.0.0\n',
    '1.0.0; echo unsafe',
    undefined,
    1,
  ])('rejects invalid or unsupported version %s', (version) => {
    expect(() =>
      releaseMetadata({...metadata, version}, `refs/tags/v${version}`),
    ).toThrow('Release versions must be stable or numbered alpha, beta, or rc versions');
  });

  it.each(['refs/heads/main', 'refs/heads/v0.1.0', 'refs/tags/v0.2.0', 'v0.1.0'])(
    'rejects a mismatched or non-tag ref %s',
    (ref) => {
      expect(() => releaseMetadata(metadata, ref)).toThrow(
        'Release tag must be v0.1.0, matching package.json',
      );
    },
  );

  it.each([
    {...metadata, name: 'another-package'},
    {...metadata, private: true},
  ])('rejects a different or private package', (value) => {
    expect(() => releaseMetadata(value, 'refs/tags/v0.1.0')).toThrow(
      'Releases must publish the public vite-plugin-shopify-easel package',
    );
  });

  it('rejects a plugin repository that does not match the trusted publisher', () => {
    expect(() =>
      releaseMetadata(
        {...metadata, repository: {url: 'https://example.com'}},
        'refs/tags/v0.1.0',
      ),
    ).toThrow('The plugin repository must match the trusted publisher');
  });

  it.each([
    {name: 'another-package'},
    {private: true},
    {repository: {url: 'https://example.com'}},
    {repository: {url: metadata.repository.url, directory: 'packages/other'}},
    {bin: {'create-easel-theme': 'bin/other.mjs'}},
  ])('rejects invalid generator metadata %#', (generator) => {
    expect(() => releaseMetadata(metadata, 'refs/tags/v0.1.0', generator)).toThrow();
  });

  it('rejects different plugin and generator versions', () => {
    expect(() =>
      releaseMetadata(metadata, 'refs/tags/v0.1.0', {version: '0.2.0'}),
    ).toThrow('The plugin and generator versions must match');
  });

  it('requires generator metadata', () => {
    expect(() => validateReleaseMetadata(metadata, 'refs/tags/v0.1.0')).toThrow(
      'Release metadata must include create-easel-theme',
    );
  });
});
