import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {basename, join, relative, sep} from 'node:path';
import {build} from 'vite';
import {describe, expect, it, vi} from 'vitest';
import {mountSections} from '../examples/named-bundles/src/sections.ts';

const example = join(process.cwd(), 'examples/named-bundles');

describe('named bundle example', () => {
  it('keeps the shared, product, and collection assets separate', async () => {
    const fixtures = join(process.cwd(), '.easel');
    mkdirSync(fixtures, {recursive: true});
    const root = mkdtempSync(join(fixtures, 'named-bundles-'));
    try {
      cpSync(example, root, {
        recursive: true,
        filter(path) {
          const file = relative(example, path);
          return (
            !['node_modules', '.easel'].includes(basename(path)) &&
            !file.startsWith(`assets${sep}easel-`) &&
            file !== `snippets${sep}easel-assets.liquid`
          );
        },
      });
      await build({configFile: join(root, 'vite.config.ts'), logLevel: 'silent'});
      const loader = readFileSync(join(root, 'snippets/easel-assets.liquid'), 'utf8');
      for (const name of ['theme', 'product', 'collection']) {
        const branch = loader
          .split(`{% when '${name}' %}`)[1]
          ?.split(/{% (?:when|else)/)[0];
        expect(branch).toContain(`'easel-${name}.js' | asset_url`);
        expect(branch).toContain(`'easel-${name}.css' | asset_url`);
        for (const other of ['theme', 'product', 'collection'].filter(
          (value) => value !== name,
        )) {
          expect(branch).not.toContain(`easel-${other}.`);
        }
      }
      const script = (name) =>
        readFileSync(join(root, `assets/easel-${name}.js`), 'utf8');
      const css = (name) => readFileSync(join(root, `assets/easel-${name}.css`), 'utf8');
      expect(script('product')).toContain('data-quantity-demo');
      expect(script('product')).not.toContain('data-collection-filter');
      expect(script('collection')).toContain('data-collection-filter');
      expect(script('collection')).not.toContain('data-quantity-demo');
      expect(script('theme')).not.toMatch(/data-quantity-demo|data-collection-filter/);
      expect(css('product')).toContain('.quantity-demo');
      expect(css('product')).not.toContain('.collection-filter');
      expect(css('collection')).toContain('.collection-filter');
      expect(css('collection')).not.toContain('.quantity-demo');
      expect(css('theme')).not.toMatch(/\.quantity-demo|\.collection-filter/);
      expect(readFileSync(join(root, 'assets/easel.svg'), 'utf8')).toBe(
        readFileSync(join(example, 'assets/easel.svg'), 'utf8'),
      );
      const layout = readFileSync(join(root, 'layout/theme.liquid'), 'utf8');
      expect(layout).toContain("{% render 'easel-assets', entry: 'theme' %}");
      expect(layout).toContain('{% case request.page_type %}');
      for (const name of ['product', 'collection']) {
        expect(layout).toMatch(
          new RegExp(
            `{% when '${name}' %}\\s*{% render 'easel-assets', entry: '${name}' %}`,
          ),
        );
        expect(readFileSync(join(root, `src/pages/${name}.ts`), 'utf8')).toContain(
          'import.meta.hot.dispose(dispose)',
        );
      }
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('mounts once, unloads only the affected section, and removes global listeners', () => {
    class ElementFixture extends EventTarget {
      constructor(matches = true, children = []) {
        super();
        this.matchesSelector = matches;
        this.children = children;
      }
      matches() {
        return this.matchesSelector;
      }
      querySelectorAll() {
        return this.children.filter((child) => child.matches());
      }
      contains(element) {
        return this === element || this.children.some((child) => child.contains(element));
      }
    }
    const first = new ElementFixture();
    const second = new ElementFixture();
    const wrapper = new ElementFixture(false, [first]);
    const document = new ElementFixture(false, [first, second]);
    const cleanups = [];
    const mount = vi.fn(() => {
      const cleanup = vi.fn();
      cleanups.push(cleanup);
      return cleanup;
    });
    vi.stubGlobal('HTMLElement', ElementFixture);
    vi.stubGlobal('document', document);
    let stop;
    try {
      stop = mountSections('[data-example]', mount);
      const dispatch = (type, target) => {
        const event = new Event(type);
        Object.defineProperty(event, 'target', {value: target});
        document.dispatchEvent(event);
      };
      expect(mount).toHaveBeenCalledTimes(2);
      dispatch('shopify:section:load', wrapper);
      expect(mount).toHaveBeenCalledTimes(2);
      dispatch('shopify:section:unload', wrapper);
      expect(cleanups[0]).toHaveBeenCalledTimes(1);
      expect(cleanups[1]).not.toHaveBeenCalled();
      dispatch('shopify:section:load', first);
      expect(mount).toHaveBeenCalledTimes(3);
      stop();
      for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledTimes(1);
      dispatch('shopify:section:load', wrapper);
      expect(mount).toHaveBeenCalledTimes(3);
    } finally {
      stop?.();
      vi.unstubAllGlobals();
    }
  });
});
