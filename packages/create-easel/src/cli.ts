import * as p from '@clack/prompts';
import {assertTargetDirectory} from './directory.js';
import {resolve} from 'node:path';
import {version} from '../package.json';
import {generateTheme} from './generate.js';
import {
  changeDirectoryCommand,
  installArguments,
  installDependencies,
  InstallError,
} from './install.js';
import {
  choice,
  defaultName,
  detectPackageManager,
  frameworks,
  languages,
  packageManagers,
  packageNameFor,
  parseArguments,
} from './options.js';

const help = `Usage: create-easel <directory> [options]

Create a Shopify Liquid theme with Easel and Vite.

  --language ts|js                 Language (default: ts)
  --framework none|alpine|react|vue UI tools (default: none)
  --tailwind / --no-tailwind       Tailwind CSS (default: plain CSS)
  --name <name>                   Theme display name
  --package-manager npm|pnpm|yarn|bun
  --install / --no-install        Install dependencies
  --yes, -y                      Use defaults without prompts
  --no-interactive               Disable prompts
  --help, -h                     Show help
  --version, -v                  Show version

Non-interactive runs require a directory and only install with --install.
Use . for the current directory, empty apart from .git or .DS_Store.
Existing project files are never overwritten. Shopify CLI remains separate.
`;

class Cancelled extends Error {}

async function ask<T>(answer: Promise<T | symbol>): Promise<T> {
  const value = await answer;
  if (p.isCancel(value)) throw new Cancelled();
  return value as T;
}

function targetError(target: string | undefined): string | undefined {
  try {
    if (!target) throw new Error('Provide a directory for your theme.');
    packageNameFor(target);
    assertTargetDirectory(resolve(target));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function main(): Promise<void> {
  let interactive = false;
  try {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      console.log(help);
      return;
    }
    if (args.version) {
      console.log(version);
      return;
    }
    const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (args.interactive && !tty)
      throw new Error(
        'Interactive mode requires a terminal. Supply a directory and flags instead.',
      );
    const ci = Boolean(process.env.CI && !['false', '0'].includes(process.env.CI));
    interactive = tty && !args.yes && (args.interactive ?? !ci);
    if (interactive) p.intro(`Create an Easel theme · ${version}`);
    const target =
      args.target ??
      (interactive
        ? await ask(
            p.text({
              message: 'Where should we create your theme? (. for current directory)',
              placeholder: 'my-theme',
              defaultValue: 'my-theme',
              validate: (value) => targetError(value || 'my-theme'),
            }),
          )
        : undefined);
    const problem = targetError(target);
    if (problem || !target) throw new Error(problem ?? 'Provide a target directory.');

    const language = choice(
      args.language ??
        (interactive
          ? await ask(
              p.select({
                message: 'Which language?',
                initialValue: 'ts',
                options: [
                  {value: 'ts', label: 'TypeScript', hint: 'recommended'},
                  {value: 'js', label: 'JavaScript'},
                ],
              }),
            )
          : 'ts'),
      languages,
      '--language',
    );
    const framework = choice(
      args.framework ??
        (interactive
          ? await ask(
              p.select({
                message: 'Which UI tools?',
                initialValue: 'none',
                options: [
                  {value: 'none', label: 'None', hint: 'plain browser APIs'},
                  {value: 'alpine', label: 'Alpine'},
                  {value: 'react', label: 'React'},
                  {value: 'vue', label: 'Vue'},
                ],
              }),
            )
          : 'none'),
      frameworks,
      '--framework',
    );
    const tailwind =
      args.tailwind ??
      (interactive
        ? await ask(p.confirm({message: 'Add Tailwind CSS?', initialValue: false}))
        : false);
    const manager = choice(
      args['package-manager'] ?? detectPackageManager(),
      packageManagers,
      '--package-manager',
    );
    const install =
      args.install ??
      (interactive
        ? await ask(
            p.confirm({
              message: `Install dependencies with ${manager}? This runs package install scripts.`,
              initialValue: true,
            }),
          )
        : false);
    const options = {
      target,
      name: args.name ?? defaultName(target),
      language,
      framework,
      tailwind,
    };
    if (interactive) p.log.step('Creating your theme…');
    const created = generateTheme(options);
    if (interactive) p.log.success(`Created ${created}`);
    else console.log(`Created ${created}`);

    let installed = false;
    if (install) {
      if (interactive) p.log.step(`Installing with ${manager}…`);
      try {
        await installDependencies(created, manager);
        installed = true;
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        console.error(
          'Your theme files have been kept. You can retry installation below.',
        );
        process.exitCode = error instanceof InstallError && error.cancelled ? 130 : 1;
      }
    }
    const steps = created === process.cwd() ? [] : [changeDirectoryCommand(created)];
    if (!installed) steps.push(`${manager} ${installArguments(manager).join(' ')}`);
    steps.push(`${manager} run dev`);
    const message = `${steps.join('\n')}\n\nIn another terminal:\nshopify theme dev --store your-store.myshopify.com --notify .easel/shopify-ready\n\nShopify CLI must be installed and authenticated separately.`;
    if (interactive) {
      p.note(message, 'Next steps');
      p.outro('Your theme is yours to build.');
    } else console.log(`\n${message}`);
  } catch (error) {
    const message =
      error instanceof Cancelled
        ? 'Operation cancelled. No theme created.'
        : error instanceof Error
          ? error.message
          : String(error);
    if (interactive) p.cancel(message);
    else console.error(message);
    process.exitCode = error instanceof Cancelled ? 130 : 1;
  }
}

await main();
