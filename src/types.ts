export interface FrameBundle {
  script?: string;
  style?: string;
}

export interface FrameRefreshOptions {
  /** Shopify CLI --notify file relative to Vite's root. */
  signal?: string;
  /** Delay used to combine repeated Shopify CLI notifications. */
  delay?: number;
}

export interface FrameOptions {
  /** Shopify theme path relative to Vite's root. Defaults to the Vite root. */
  theme?: string;
  /** Source path relative to Vite's root. Defaults to "src". */
  source?: string;
  /** Named storefront bundles. Defaults to src/main.ts or src/main.js plus src/style.css. */
  bundles?: Record<string, FrameBundle>;
  /** Generated snippet filename under the theme's snippets directory. */
  liquid?: string;
  /** Namespace used for generated theme assets. */
  prefix?: string;
  /** Shopify-aware full-page refresh. Enabled by default. */
  refresh?: boolean | FrameRefreshOptions;
}

export interface ResolvedFrameBundle {
  name: string;
  script?: string;
  style?: string;
}

export interface ResolvedFrameOptions {
  projectRoot: string;
  themePath: string;
  sourcePath: string;
  stagingPath: string;
  ledgerPath: string;
  liquidPath: string;
  liquidFilename: string;
  prefix: string;
  refresh: {
    enabled: boolean;
    signalPath: string;
    delay: number;
  };
  bundles: ResolvedFrameBundle[];
}

export interface FrameManifestEntry {
  script?: string;
  styles: string[];
  imports: string[];
}

export interface FrameManifest {
  schemaVersion: 1;
  entries: Record<string, FrameManifestEntry>;
  generated: string[];
}

export interface FrameOwnershipLedger {
  schemaVersion: 1;
  themePath: string;
  generated: string[];
}
