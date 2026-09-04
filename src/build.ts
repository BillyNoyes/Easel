import {existsSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import type {Manifest, ResolvedConfig} from 'vite';
import {renderProductionLiquid} from './liquid.js';
import {createFrameManifest} from './manifest.js';
import {commitProductionOutput} from './output.js';
import type {ResolvedFrameOptions} from './types.js';

export function finalizeProductionBuild(
  options: ResolvedFrameOptions,
  config: ResolvedConfig,
  publish: boolean,
): void {
  try {
    if (!publish) return;
    const viteManifest = readViteManifest(options.stagingPath);
    const manifest = createFrameManifest(
      viteManifest,
      options.bundles,
      listEmittedFiles(options.stagingPath),
    );
    commitProductionOutput(options, manifest, renderProductionLiquid(manifest));
  } finally {
    removeStagingDirectory(options.stagingPath, config);
  }
}

function readViteManifest(stagingPath: string): Manifest {
  const path = join(stagingPath, '.vite', 'manifest.json');
  if (!existsSync(path)) {
    throw new Error(`[frame] Vite did not write its build manifest: ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  } catch (error) {
    throw new Error(`[frame] Vite wrote an invalid build manifest: ${path}`, {
      cause: error,
    });
  }
}

function removeStagingDirectory(stagingPath: string, config: ResolvedConfig): void {
  try {
    rmSync(stagingPath, {recursive: true, force: true});
  } catch (error) {
    config.logger.warn(
      `[frame] could not remove staging directory ${stagingPath}: ${errorMessage(error)}`,
    );
  }
}

function listEmittedFiles(stagingPath: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(stagingPath, {withFileTypes: true})) {
    if (entry.name === '.vite' && entry.isDirectory()) continue;
    if (!entry.isFile()) {
      throw new Error(`[frame] unexpected output in staging directory: ${entry.name}`);
    }
    files.push(entry.name);
  }
  return files;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
