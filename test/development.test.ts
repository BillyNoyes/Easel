import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {describe, expect, it, type Mock, vi} from 'vitest';
import {restoreOnTermination, type TerminationProcess} from '../src/development.js';
import {easel} from '../src/index.js';

function fakeProcess(): {target: EventEmitter & TerminationProcess; kill: Mock} {
  const kill = vi.fn();
  const target = Object.assign(new EventEmitter(), {pid: 4242, kill});
  return {target, kill};
}

describe('restoreOnTermination', () => {
  it.each(['SIGINT', 'SIGHUP'] as const)(
    'restores, detaches, and re-raises %s when nothing else handles it',
    (signal) => {
      const {target, kill} = fakeProcess();
      const restore = vi.fn();
      restoreOnTermination(restore, target, () => 0);

      target.emit(signal, signal);

      expect(restore).toHaveBeenCalledOnce();
      expect(kill).toHaveBeenCalledWith(4242, signal);
      expect(target.listenerCount('SIGINT')).toBe(0);
      expect(target.listenerCount('SIGHUP')).toBe(0);
      expect(target.listenerCount('exit')).toBe(0);
    },
  );

  it('leaves shutdown to another signal listener', () => {
    const {target, kill} = fakeProcess();
    const restore = vi.fn();
    const otherListener = vi.fn();
    target.on('SIGINT', otherListener);
    restoreOnTermination(restore, target, () => 0);

    target.emit('SIGINT', 'SIGINT');

    expect(restore).toHaveBeenCalledOnce();
    expect(otherListener).toHaveBeenCalledOnce();
    expect(kill).not.toHaveBeenCalled();
  });

  it('re-raises when the only other listeners belong to signal-exit', () => {
    const {target, kill} = fakeProcess();
    const restore = vi.fn();
    target.on('SIGINT', vi.fn());
    restoreOnTermination(restore, target, () => 1);

    target.emit('SIGINT', 'SIGINT');

    expect(restore).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledWith(4242, 'SIGINT');
  });

  it('re-raises once after every Easel instance in the process has restored', () => {
    const {target, kill} = fakeProcess();
    const first = vi.fn();
    const second = vi.fn();
    restoreOnTermination(first, target, () => 0);
    restoreOnTermination(second, target, () => 0);

    target.emit('SIGINT', 'SIGINT');

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledOnce();
    expect(target.listenerCount('SIGINT')).toBe(0);
  });

  it('restores once when the process exits', () => {
    const {target} = fakeProcess();
    const restore = vi.fn();
    restoreOnTermination(restore, target, () => 0);

    target.emit('exit');
    target.emit('exit');

    expect(restore).toHaveBeenCalledOnce();
  });

  it('does not handle SIGTERM, which Vite answers by closing the server', () => {
    const {target} = fakeProcess();
    restoreOnTermination(vi.fn(), target, () => 0);

    expect(target.listenerCount('SIGTERM')).toBe(0);
  });

  it('stops listening once detached', () => {
    const {target} = fakeProcess();
    const restore = vi.fn();
    const detach = restoreOnTermination(restore, target, () => 0);

    detach();
    target.emit('exit');

    expect(restore).not.toHaveBeenCalled();
    expect(target.listenerCount('SIGINT')).toBe(0);
  });
});

const sourceEntry = fileURLToPath(new URL('../src/index.ts', import.meta.url));
const viteEntry = import.meta.resolve('vite');

function themeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'easel-signal-'));
  for (const directory of ['assets', 'layout', 'snippets', 'src']) {
    mkdirSync(join(root, directory), {recursive: true});
  }
  writeFileSync(join(root, 'src/main.ts'), "console.log('Easel');");
  writeFileSync(join(root, 'src/style.css'), 'body {}');
  writeFileSync(
    join(root, 'vite.config.mjs'),
    `import {easel} from ${JSON.stringify(sourceEntry)};\nexport default {logLevel: 'silent', server: {port: 0}, plugins: [easel()]};\n`,
  );
  writeFileSync(
    join(root, 'serve.mjs'),
    `import {createServer} from ${JSON.stringify(viteEntry)};\nconst server = await createServer({root: ${JSON.stringify(root)}, configFile: ${JSON.stringify(join(root, 'vite.config.mjs'))}});\nawait server.listen();\nconsole.log('listening');\n`,
  );
  return root;
}

describe.skipIf(process.platform === 'win32')('Easel development server signals', () => {
  it('restores the production loader when the dev server is interrupted', async () => {
    const root = themeProject();
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [easel()],
    });
    const liquidPath = join(root, 'snippets/easel-assets.liquid');
    const production = readFileSync(liquidPath, 'utf8');

    const child = spawn(process.execPath, [join(root, 'serve.mjs')], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const exited = new Promise<NodeJS.Signals | null>((resolve) => {
      child.once('exit', (_code, signal) => resolve(signal));
    });

    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('listening')) resolve();
        });
        child.once('exit', (code) =>
          reject(new Error(`dev server exited early: ${code}`)),
        );
      });
      expect(readFileSync(liquidPath, 'utf8')).toContain('/@vite/client');

      child.kill('SIGINT');

      expect(await exited).toBe('SIGINT');
      expect(readFileSync(liquidPath, 'utf8')).toBe(production);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 30_000);
});
