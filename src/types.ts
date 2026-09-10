export interface EaselBundle {
  script?: string;
  style?: string;
}

export interface EaselRefreshOptions {
  /** Shopify CLI --notify file relative to Vite's root. */
  signal?: string;
  /** Delay used to combine repeated Shopify CLI notifications. */
  delay?: number;
}

export interface EaselOptions {
  /** Shopify theme path relative to Vite's root. Defaults to the Vite root. */
  theme?: string;
  /** Source path relative to Vite's root. Defaults to "src". */
  source?: string;
  /** Named storefront bundles. Defaults to src/main.ts or src/main.js plus src/style.css. */
  bundles?: Record<string, EaselBundle>;
  /** Namespace used for generated assets and the Liquid loader. Defaults to "easel". */
  namespace?: string;
  /** Shopify-aware full-page refresh. Enabled by default. */
  refresh?: boolean | EaselRefreshOptions;
}

export interface ResolvedEaselBundle {
  name: string;
  script?: string;
  style?: string;
}

export interface ResolvedEaselOptions {
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
  bundles: ResolvedEaselBundle[];
}

export interface EaselManifestEntry {
  script?: string;
  styles: string[];
  imports: string[];
}

export interface EaselManifest {
  schemaVersion: 1;
  entries: Record<string, EaselManifestEntry>;
  generated: string[];
}

export interface EaselOwnershipLedger {
  schemaVersion: 2;
  themePath: string;
  prefix: string;
  liquidFilename: string;
  generated: string[];
}
