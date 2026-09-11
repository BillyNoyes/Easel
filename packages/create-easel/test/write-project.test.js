import * as fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {writeProject} from '../src/write-project.ts';

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal();
  return {...original, copyFileSync: vi.fn(original.copyFileSync)};
});
const original = await vi.importActual('node:fs');
const directories = [];
beforeEach(() => {
  fs.copyFileSync.mockImplementation(original.copyFileSync);
});
afterEach(() => {
  vi.resetAllMocks();
  for (const path of directories.splice(0))
    fs.rmSync(path, {recursive: true, force: true});
});

function fixture(existing = true) {
  const root = fs.mkdtempSync(join(tmpdir(), 'easel-create-write-'));
  directories.push(root);
  const source = join(root, 'source');
  const target = join(root, 'theme');
  fs.mkdirSync(join(source, 'assets'), {recursive: true});
  fs.writeFileSync(join(source, 'assets/a.txt'), 'Generated A');
  fs.writeFileSync(join(source, 'assets/b.txt'), 'Generated B');
  if (existing) {
    fs.mkdirSync(target);
    fs.writeFileSync(join(target, '.git'), 'gitdir: existing-worktree');
  }
  return {source, target};
}

it.each([true, false])(
  'rolls back output without removing a pre-existing directory: %s',
  (existing) => {
    const {source, target} = fixture(existing);
    const inode = existing ? fs.lstatSync(target).ino : undefined;
    fs.copyFileSync
      .mockImplementationOnce(original.copyFileSync)
      .mockImplementationOnce(() => {
        throw new Error('Copy failed');
      });
    expect(() => writeProject(source, target)).toThrow('Copy failed');
    if (existing) {
      expect(fs.lstatSync(target).ino).toBe(inode);
      expect(fs.readdirSync(target)).toEqual(['.git']);
      expect(fs.readFileSync(join(target, '.git'), 'utf8')).toBe(
        'gitdir: existing-worktree',
      );
    } else expect(fs.existsSync(target)).toBe(false);
  },
);

it('does not overwrite or remove files created by another writer', () => {
  const {source, target} = fixture();
  let collision;
  fs.copyFileSync
    .mockImplementationOnce(original.copyFileSync)
    .mockImplementationOnce((input, output, flags) => {
      collision = output;
      fs.writeFileSync(output, 'Concurrent file');
      fs.writeFileSync(join(target, 'notes.txt'), 'Concurrent notes');
      original.copyFileSync(input, output, flags);
    });
  expect(() => writeProject(source, target)).toThrow();
  expect(fs.readFileSync(collision, 'utf8')).toBe('Concurrent file');
  expect(fs.readFileSync(join(target, 'notes.txt'), 'utf8')).toBe('Concurrent notes');
  expect(fs.readFileSync(join(target, '.git'), 'utf8')).toBe('gitdir: existing-worktree');
  expect(fs.readdirSync(join(target, 'assets'))).toHaveLength(1);
});

it('preserves edits to generated files during rollback', () => {
  const {source, target} = fixture();
  let first;
  fs.copyFileSync
    .mockImplementationOnce((input, output, flags) => {
      first = output;
      original.copyFileSync(input, output, flags);
    })
    .mockImplementationOnce(() => {
      fs.writeFileSync(first, 'An edit to keep');
      throw new Error('Copy failed');
    });
  expect(() => writeProject(source, target)).toThrow('Copy failed');
  expect(fs.readFileSync(first, 'utf8')).toBe('An edit to keep');
  expect(fs.readFileSync(join(target, '.git'), 'utf8')).toBe('gitdir: existing-worktree');
});
