import {describe, expect, it} from 'vitest';
import {releaseMetadata} from '../scripts/release-metadata.mjs';

const metadata = {
  name: 'vite-plugin-shopify-easel',
  version: '0.1.0',
  repository: {url: 'git+https://github.com/BillyNoyes/Easel.git'},
};

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

  it('rejects a repository that does not match the trusted publisher', () => {
    expect(() =>
      releaseMetadata(
        {...metadata, repository: {url: 'https://example.com'}},
        'refs/tags/v0.1.0',
      ),
    ).toThrow('The package repository must match the trusted publisher');
  });
});
