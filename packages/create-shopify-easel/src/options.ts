import {basename, resolve} from 'node:path';
import {parseArgs} from 'node:util';

export const languages = ['ts', 'js'] as const;
export const frameworks = ['none', 'alpine', 'react', 'vue'] as const;
export const packageManagers = ['npm', 'pnpm', 'yarn', 'bun'] as const;

export interface ThemeOptions {
  target: string;
  name: string;
  language: (typeof languages)[number];
  framework: (typeof frameworks)[number];
  tailwind: boolean;
}

export function parseArguments(args: string[]) {
  const {values, positionals} = parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true,
    strict: true,
    options: {
      help: {type: 'boolean', short: 'h'},
      version: {type: 'boolean', short: 'v'},
      yes: {type: 'boolean', short: 'y'},
      name: {type: 'string'},
      language: {type: 'string'},
      framework: {type: 'string'},
      tailwind: {type: 'boolean'},
      install: {type: 'boolean'},
      'package-manager': {type: 'string'},
      interactive: {type: 'boolean'},
    },
  });
  if (positionals.length > 1) throw new Error('Provide only one target directory.');
  if (values.language !== undefined) choice(values.language, languages, '--language');
  if (values.framework !== undefined) choice(values.framework, frameworks, '--framework');
  if (values['package-manager'] !== undefined) {
    choice(values['package-manager'], packageManagers, '--package-manager');
  }
  if (values.name !== undefined) validateName(values.name);
  return {...values, target: positionals[0]};
}

export function choice<T extends string>(
  value: string,
  options: readonly T[],
  label: string,
): T {
  const match = options.find((option) => option === value);
  if (match === undefined)
    throw new Error(`${label} must be one of: ${options.join(', ')}.`);
  return match;
}

export function detectPackageManager(userAgent = process.env.npm_config_user_agent) {
  return packageManagers.find((manager) => userAgent?.startsWith(`${manager}/`)) ?? 'npm';
}

export function validateName(name: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,49}$/.test(name)) {
    throw new Error(
      'Theme name must be 1–50 characters: letters, numbers, spaces, underscores, or hyphens.',
    );
  }
}

export function packageNameFor(target: string): string {
  if (!target.trim() || /[\u0000-\u001f\u007f]/.test(resolve(target))) {
    throw new Error('Provide a target directory without control characters.');
  }
  const name = basename(resolve(target));
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error(
      'The target uses a reserved Windows filename. Choose another directory.',
    );
  }
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug || slug.length > 214 || slug === 'node-modules' || slug === 'favicon-ico') {
    throw new Error('The target directory must produce a valid npm package name.');
  }
  return slug;
}

export function defaultName(target: string): string {
  return packageNameFor(target)
    .split('-')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 50)
    .trim();
}

export function validateOptions(options: ThemeOptions): void {
  packageNameFor(options.target);
  validateName(options.name);
  choice(options.language, languages, 'Language');
  choice(options.framework, frameworks, 'Framework');
  if (typeof options.tailwind !== 'boolean')
    throw new Error('Tailwind must be a boolean.');
}
