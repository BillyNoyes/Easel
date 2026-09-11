import spawn from 'cross-spawn';
import type {packageManagers} from './options.js';

export type PackageManager = (typeof packageManagers)[number];

export function installArguments(manager: PackageManager): string[] {
  return manager === 'pnpm' ? ['install', '--ignore-workspace'] : ['install'];
}

export class InstallError extends Error {
  constructor(
    message: string,
    readonly cancelled: boolean,
  ) {
    super(message);
  }
}

export function installDependencies(
  target: string,
  manager: PackageManager,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(manager, installArguments(manager), {
      cwd: target,
      stdio: 'inherit',
    });
    let interrupted = false;
    const interrupt = () => {
      interrupted = true;
      child.kill('SIGINT');
    };
    process.on('SIGINT', interrupt);
    const cleanup = () => process.removeListener('SIGINT', interrupt);
    child.on('error', (error) => {
      cleanup();
      reject(new InstallError(`Could not run ${manager}: ${error.message}`, interrupted));
    });
    child.on('close', (code, signal) => {
      cleanup();
      if (code === 0 && !interrupted) resolve();
      else
        reject(
          new InstallError(
            `${manager} install ${interrupted || signal ? 'was interrupted' : `exited with code ${String(code)}`}.`,
            interrupted || signal === 'SIGINT',
          ),
        );
    });
  });
}

export function changeDirectoryCommand(
  path: string,
  platform = process.platform,
): string {
  if (platform === 'win32')
    return `Set-Location -LiteralPath '${path.replaceAll("'", "''")}'`;
  return `cd '${path.replaceAll("'", "'\\''")}'`;
}
