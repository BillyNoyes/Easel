export function validatePackageContents(listing) {
  const files = new Set(listing.split(/\r?\n/));
  for (const required of [
    'package/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/dist/index.js',
    'package/dist/index.d.ts',
  ]) {
    if (!files.has(required)) {
      throw new Error(`package tarball is missing ${required}`);
    }
  }
  if ([...files].some((file) => file.startsWith('package/src/'))) {
    throw new Error('package tarball must not contain source files');
  }
}
