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
  /** Namespace used for generated assets and the Liquid loader. Defaults to "frame". */
  namespace?: string;
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
  commitLockPath: string;
  manifestPath: string;
  productionLiquidPath: string;
  transactionPath: string;
  liquidPath: string;
  liquidFilename: string;
  namespace: string;
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
  schemaVersion: 2;
  themePath: string;
  prefix: string;
  liquidFilename: string;
  generated: string[];
}
