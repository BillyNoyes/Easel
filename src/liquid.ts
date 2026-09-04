import type {FrameManifest, FrameManifestEntry} from './types.js';
import {PUBLIC_PREFIX} from './virtual.js';

const MAX_LIQUID_BYTES = 200_000;
const ENTRY_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function renderProductionLiquid(manifest: FrameManifest): string {
  const entries = validatedManifestEntries(manifest);
  const defaultEntry = entries[0]?.[0];
  if (defaultEntry === undefined) {
    throw new Error('[frame] cannot render Liquid without an entry');
  }

  const lines = loaderHeader('Generated asset loader managed by Frame.', defaultEntry);

  for (const [name, entry] of entries) {
    lines.push(`  {% when ${liquidEntryLiteral(name)} %}`);
    for (const style of entry.styles) {
      lines.push(
        `    {{ ${liquidAssetLiteral(style, 'stylesheet', '.css')} | asset_url | stylesheet_tag }}`,
      );
    }
    for (const imported of entry.imports) {
      lines.push(
        `    <link rel="modulepreload" href="{{ ${liquidAssetLiteral(imported, 'module import', '.js')} | asset_url }}">`,
      );
    }
    if (entry.script !== undefined) {
      lines.push(
        `    <script src="{{ ${liquidAssetLiteral(entry.script, 'entry script', '.js')} | asset_url }}" type="module" defer></script>`,
      );
    }
  }

  return finishLoader(lines);
}

export function renderDevelopmentLiquid(names: string[], origin: string): string {
  const entries = validatedEntryNames(names);
  const defaultEntry = entries[0];
  if (defaultEntry === undefined) {
    throw new Error('[frame] cannot render Liquid without an entry');
  }

  const safeOrigin = normalizeOrigin(origin);
  const lines = loaderHeader(
    'Generated development asset loader managed by Frame.',
    defaultEntry,
    [`<script src="${safeOrigin}/@vite/client" type="module"></script>`],
  );

  for (const name of entries) {
    lines.push(`  {% when ${liquidEntryLiteral(name)} %}`);
    lines.push(
      `    <script src="${safeOrigin}${PUBLIC_PREFIX}${encodeURIComponent(name)}" type="module"></script>`,
    );
  }

  return finishLoader(lines);
}

function loaderHeader(
  description: string,
  defaultEntry: string,
  preamble: string[] = [],
): string[] {
  return [
    '{% doc %}',
    description,
    '@param {string} [entry] - Named Frame bundle to render.',
    '{% enddoc %}',
    '{% liquid',
    `  assign frame_entry = entry | default: ${liquidEntryLiteral(defaultEntry)}`,
    '%}',
    ...preamble,
    '{% case frame_entry %}',
  ];
}

function finishLoader(lines: string[]): string {
  lines.push(
    '  {% else %}',
    '    <!-- [frame] Unknown bundle "{{ frame_entry | escape }}". -->',
    '{% endcase %}',
    '',
  );
  return assertLiquidSize(lines.join('\n'));
}

function validatedManifestEntries(
  manifest: FrameManifest,
): [string, FrameManifestEntry][] {
  if (manifest.schemaVersion !== 1) {
    throw new Error(
      `[frame] unsupported manifest schema version: ${JSON.stringify(manifest.schemaVersion)}`,
    );
  }
  const entries = Object.entries(manifest.entries);
  validatedEntryNames(entries.map(([name]) => name));
  return entries;
}

function validatedEntryNames(names: string[]): string[] {
  const seen = new Set<string>();
  for (const name of names) {
    if (!ENTRY_NAME.test(name)) {
      throw new Error(`[frame] cannot render unsafe Liquid bundle name: ${name}`);
    }
    if (seen.has(name)) {
      throw new Error(`[frame] cannot render duplicate Liquid bundle name: ${name}`);
    }
    seen.add(name);
  }
  return names;
}

function liquidEntryLiteral(name: string): string {
  if (!ENTRY_NAME.test(name)) {
    throw new Error(`[frame] cannot render unsafe Liquid bundle name: ${name}`);
  }
  return `'${name}'`;
}

function liquidAssetLiteral(
  filename: string,
  role: string,
  extension: '.css' | '.js',
): string {
  if (!ASSET_FILENAME.test(filename) || !filename.endsWith(extension)) {
    throw new Error(`[frame] cannot render unsafe ${role} filename: ${filename}`);
  }
  return `'${filename}'`;
}

function normalizeOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`[frame] invalid Vite development origin: ${origin}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`[frame] Vite development origin must use HTTP or HTTPS: ${origin}`);
  }
  if (
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      `[frame] Vite development origin cannot contain credentials, a path, a query, or a fragment: ${origin}`,
    );
  }
  return url.origin;
}

function assertLiquidSize(content: string): string {
  const size = Buffer.byteLength(content);
  if (size > MAX_LIQUID_BYTES) {
    throw new Error(
      `[frame] generated Liquid is ${size} bytes; reduce the number of bundles below ${MAX_LIQUID_BYTES} bytes`,
    );
  }
  return content;
}
