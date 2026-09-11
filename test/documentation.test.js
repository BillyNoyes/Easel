import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, defineConfig} from 'vite';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import easel from '../src/index.js';

async function documentedCorsConfig() {
  const html = await readFile(
    new URL('../site/docs/index.html', import.meta.url),
    'utf8',
  );
  const code = html.match(
    /aria-labelledby="code-troubleshooting-cors"[^>]*>\s*<code>([\s\S]*?)<\/code>/,
  )?.[1];
  if (!code) throw new Error('The troubleshooting CORS example is missing');
  const evaluate = new Function(
    'defineConfig',
    'easel',
    code.replace(/^import [^\n]+;\n/gm, '').replace('export default', 'return'),
  );
  return evaluate(defineConfig, easel);
}

describe('documented custom storefront CORS configuration', () => {
  let root;
  let server;
  let origin;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'easel-docs-'));
    for (const directory of ['assets', 'layout', 'sections', 'snippets', 'src']) {
      await mkdir(join(root, directory));
    }
    await writeFile(join(root, 'src/main.ts'), "console.log('Documentation fixture');\n");
    await writeFile(join(root, 'src/style.css'), 'body { color: black; }\n');
    const config = await documentedCorsConfig();
    server = await createServer({
      ...config,
      root,
      configFile: false,
      logLevel: 'silent',
      server: {...config.server, host: '127.0.0.1', port: 0},
    });
    await server.listen();
    origin = server.resolvedUrls.local[0];
  }, 15000);

  afterAll(async () => {
    await server?.close();
    if (root) await rm(root, {recursive: true, force: true});
  });

  it.each([
    'https://www.example.com',
    'https://a-shop.myshopify.com',
    'https://admin.shopify.com',
    'http://localhost:9292',
    'https://localhost:9292',
    'http://127.0.0.1:9292',
    'http://[::1]:9292',
  ])('allows %s to load Vite assets', async (requestOrigin) => {
    const response = await fetch(new URL('/@vite/client', origin), {
      headers: {Origin: requestOrigin},
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(requestOrigin);
    await response.arrayBuffer();
  });

  it.each([
    'https://unrelated.example',
    'https://www.example.com.evil.test',
    'https://myshopify.com.evil.test',
    'https://admin.shopify.com.evil.test',
    'http://localhost.evil.test:9292',
    'http://www.example.com',
    'null',
  ])('does not grant CORS access to %s', async (requestOrigin) => {
    const response = await fetch(new URL('/@vite/client', origin), {
      headers: {Origin: requestOrigin},
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await response.arrayBuffer();
  });
});
