import {describe, expect, it} from 'vitest';
import {validatePackageContents} from '../scripts/package-contents.mjs';

const requiredFiles = [
  'package/package.json',
  'package/README.md',
  'package/LICENSE',
  'package/dist/index.js',
  'package/dist/index.d.ts',
];

describe.each([
  ['Unix', '\n'],
  ['Windows', '\r\n'],
])('package contents with %s line endings', (_platform, newline) => {
  it.each([true, false])(
    'accepts a complete archive with trailing newline: %s',
    (trailing) => {
      const listing = requiredFiles.join(newline) + (trailing ? newline : '');
      expect(() => validatePackageContents(listing)).not.toThrow();
    },
  );

  it.each(requiredFiles)('rejects an archive missing %s', (missing) => {
    const listing = requiredFiles.filter((file) => file !== missing).join(newline);
    expect(() => validatePackageContents(listing)).toThrow(
      `package tarball is missing ${missing}`,
    );
  });

  it('rejects source files even when every required file is present', () => {
    const listing = [...requiredFiles, 'package/src/index.ts'].join(newline);
    expect(() => validatePackageContents(listing)).toThrow(
      'package tarball must not contain source files',
    );
  });
});

describe('package contents validation', () => {
  it('rejects an empty archive', () => {
    expect(() => validatePackageContents('')).toThrow(
      'package tarball is missing package/package.json',
    );
  });
});
