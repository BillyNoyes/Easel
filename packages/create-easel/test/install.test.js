import {EventEmitter} from 'node:events';
import spawn from 'cross-spawn';
import {afterEach, expect, it, vi} from 'vitest';
import {installDependencies} from '../src/install.ts';

vi.mock('cross-spawn', () => ({default: vi.fn()}));
afterEach(() => vi.resetAllMocks());

it('handles cancellation before spawn returns the child', async () => {
  const originalListeners = process.listeners('SIGINT');
  const child = new EventEmitter();
  child.kill = vi.fn();
  spawn.mockImplementationOnce(() => {
    const interrupt = process
      .listeners('SIGINT')
      .find((listener) => !originalListeners.includes(listener));
    expect(interrupt).toBeTypeOf('function');
    interrupt();
    return child;
  });
  const result = installDependencies('/fixture', 'npm');
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGINT');
  child.emit('close', 0, null);
  await expect(result).rejects.toMatchObject({cancelled: true});
  expect(process.listeners('SIGINT')).toEqual(originalListeners);
});

it('removes its signal handler when spawning fails synchronously', async () => {
  const originalListeners = process.listeners('SIGINT');
  spawn.mockImplementationOnce(() => {
    throw new Error('Installer could not start');
  });
  await expect(installDependencies('/fixture', 'npm')).rejects.toThrow(
    'Installer could not start',
  );
  expect(process.listeners('SIGINT')).toEqual(originalListeners);
});
