import type {FrameManifest} from './types.js';
import {PUBLIC_PREFIX} from './virtual.js';

const MAX_LIQUID_BYTES = 200_000;

export function renderProductionLiquid(manifest: FrameManifest): string {
  const entries = Object.entries(manifest.entries);
  const defaultEntry = entries[0]?.[0];
  if (defaultEntry === undefined) {
    throw new Error('[frame] cannot render Liquid without an entry');
  }

  const lines = [
    '{% doc %}',
    'Generated asset loader managed by Frame.',
    '@param {string} [entry] - Named Frame bundle to render.',
    '{% enddoc %}',
    '{% liquid',
    `  assign frame_entry = entry | default: '${escapeLiquid(defaultEntry)}'`,
    '%}',
    '{% case frame_entry %}',
  ];

  for (const [name, entry] of entries) {
    lines.push(`  {% when '${escapeLiquid(name)}' %}`);
    for (const style of entry.styles) {
      lines.push(`    {{ '${escapeLiquid(style)}' | asset_url | stylesheet_tag }}`);
    }
    for (const imported of entry.imports) {
      lines.push(
        `    <link rel="modulepreload" href="{{ '${escapeLiquid(imported)}' | asset_url }}">`,
      );
    }
    if (entry.script !== undefined) {
      lines.push(
        `    <script src="{{ '${escapeLiquid(entry.script)}' | asset_url }}" type="module"></script>`,
      );
    }
  }

  lines.push('{% endcase %}', '');
  return assertLiquidSize(lines.join('\n'));
}

export function renderDevelopmentLiquid(names: string[], origin: string): string {
  const defaultEntry = names[0];
  if (defaultEntry === undefined) {
    throw new Error('[frame] cannot render Liquid without an entry');
  }

  const safeOrigin = normalizeOrigin(origin);
  const lines = [
    '{% doc %}',
    'Generated development asset loader managed by Frame.',
    '@param {string} [entry] - Named Frame bundle to render.',
    '{% enddoc %}',
    '{% liquid',
    `  assign frame_entry = entry | default: '${escapeLiquid(defaultEntry)}'`,
    '%}',
    `<script src="${safeOrigin}/@vite/client" type="module"></script>`,
    '{% case frame_entry %}',
  ];

  for (const name of names) {
    lines.push(`  {% when '${escapeLiquid(name)}' %}`);
    lines.push(
      `    <script src="${safeOrigin}${PUBLIC_PREFIX}${encodeURIComponent(name)}" type="module"></script>`,
    );
  }

  lines.push('{% endcase %}', '');
  return assertLiquidSize(lines.join('\n'));
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
  return url.origin;
}

function escapeLiquid(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
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
