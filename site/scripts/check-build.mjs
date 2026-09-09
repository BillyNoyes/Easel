#!/usr/bin/env node

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access, readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin = 'https://frame.billynoyes.co.uk';
const sections = [
  'quick-start',
  'development',
  'production',
  'bundles',
  'configuration',
  'integrations',
  'safety',
  'examples',
];
const pages = new Map([
  ['/', await readFile('dist/index.html', 'utf8')],
  ['/docs/', await readFile('dist/docs/index.html', 'utf8')],
]);
const idsFor = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))];
const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const localPath = (url) =>
  resolve('dist', `.${url.pathname}${url.pathname.endsWith('/') ? 'index.html' : ''}`);

await Promise.all([access('dist/assets/main.js'), access('dist/assets/site.css')]);

for (const [route, html] of pages) {
  const pageURL = new URL(route, origin);
  const ids = idsFor(html);
  assert.equal(new Set(ids).size, ids.length, `${route}: unique IDs`);
  assert.equal(tags(html, 'h1').length, 1, `${route}: one h1`);
  assert.match(html, /<html lang="en"/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);
  assert.match(html, /class="vbg-report"/);
  assert.match(html, /class="vbg-shell"/);
  assert.match(html, /class="vbg-skip-link"/);
  assert.doesNotMatch(html, /vbg-(?:wordmark|logo)\b|vercel-wordmark|vercel-logo/);
  assert.doesNotMatch(html, /file:\/\/|bg-canvas|token-(?:keyword|string)|theme-switch/);

  const links = tags(html, 'link').map(([tag]) => tag);
  const canonical = links.find((tag) => attribute(tag, 'rel') === 'canonical');
  assert(canonical, `${route}: canonical URL`);
  assert.equal(attribute(canonical, 'href'), pageURL.href);
  assert.equal(
    links.filter((tag) => attribute(tag, 'href')?.endsWith('/assets/vercel-brand.css'))
      .length,
    1,
    `${route}: one local foundation stylesheet`,
  );
  assert.equal(
    links.filter((tag) => attribute(tag, 'href')?.endsWith('/assets/site.css')).length,
    1,
    `${route}: stable CSS`,
  );
  assert(links.some((tag) => attribute(tag, 'href')?.includes('family=Geist:')));
  assert(links.some((tag) => attribute(tag, 'href')?.includes('family=Geist+Mono:')));
  const ogURL = tags(html, 'meta').find(
    ([tag]) => attribute(tag, 'property') === 'og:url',
  );
  assert(ogURL, `${route}: Open Graph URL`);
  assert.equal(attribute(ogURL[0], 'content'), pageURL.href);

  const data = JSON.parse(
    html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '',
  );
  assert.equal(data.url, pageURL.href);
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], route === '/' ? 'WebSite' : 'TechArticle');
  assert.equal(data.author.name, 'Billy Noyes');
  assert(!('aggregateRating' in data), 'No unsupported ratings');

  for (const [, reference] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    const url = new URL(reference.replaceAll('&amp;', '&'), pageURL);
    if (url.origin !== origin) continue;
    await access(localPath(url));
    if (url.hash) {
      assert(pages.has(url.pathname), `Known fragment route: ${reference}`);
      assert(
        idsFor(pages.get(url.pathname)).includes(url.hash.slice(1)),
        `Valid fragment target: ${route} ${reference}`,
      );
    }
  }

  for (const [pre] of tags(html, 'pre')) {
    assert.equal(attribute(pre, 'tabindex'), '0', `${route}: keyboard-scrollable code`);
    assert.equal(attribute(pre, 'role'), 'region');
    assert(ids.includes(attribute(pre, 'aria-labelledby')), 'Code has a visible label');
  }

  const scripts = tags(html, 'script').map(([tag]) => tag);
  const runtimeScripts = scripts.filter(
    (tag) => attribute(tag, 'type') !== 'application/ld+json',
  );
  if (route === '/') {
    assert.equal(runtimeScripts.length, 0, 'Landing is CSS-only');
    assert.doesNotMatch(html, /x-data|@click|data-code-block[^>]*x-data|<button/);
    assert.match(html, /<h1[^>]*>Vite Plugin for Shopify Liquid Themes\.<\/h1>/);
    assert.match(html, /href="\/docs\/"[^>]*>\s*Get started/);
  } else {
    assert.equal(runtimeScripts.length, 1, 'Docs has one runtime entry');
    assert.equal(attribute(runtimeScripts[0], 'type'), 'module');
    assert.equal(
      new URL(attribute(runtimeScripts[0], 'src'), pageURL).pathname,
      '/assets/main.js',
      'Docs uses legacy stable JS URL',
    );
    for (const id of sections) {
      assert(ids.includes(id), `Preserved section: ${id}`);
      assert.match(html, new RegExp(`activeSection === '${id}' \\? 'location' : null`));
    }
    const disclosure = html.match(/<details\b[^>]*>([\s\S]*?)<\/details>/)?.[0];
    assert(disclosure, 'Native mobile navigation works without JavaScript');
    assert.doesNotMatch(disclosure, /x-cloak|x-show|\shidden(?:\s|>)/);
    assert.match(disclosure, /<summary\b/);
    for (const id of sections) assert(disclosure.includes(`href="#${id}"`));
    assert.match(html, /"dev": "vite"/);
    assert.match(html, /"build": "vite build"/);
    assert.match(html, /refresh\.signal/);
    assert.match(html, /refresh\.delay/);
    assert.match(html, /milliseconds/);
  }
}

const assets = await readdir('dist/assets');
assert(!assets.some((file) => /^(?:main|site)-[\w-]+\.(?:js|css)$/.test(file)));
const foundation = await readFile('public/assets/vercel-brand.css');
assert.equal(
  createHash('sha256').update(foundation).digest('hex'),
  'e4f4f41f48947fbb24f4eb49cab37cb077a04af656f746388a9052c1c7f1330e',
  'Foundation matches the upstream snapshot',
);
assert.deepEqual(await readFile('dist/assets/vercel-brand.css'), foundation);

const sitemap = await readFile('dist/sitemap.xml', 'utf8');
assert.match(sitemap, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
assert.deepEqual(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]).sort(),
  [...pages.keys()].map((route) => `${origin}${route}`).sort(),
);
const robots = await readFile('dist/robots.txt', 'utf8');
assert.match(robots, /User-agent: \*/);
assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
assert(!/Disallow:\s*\//.test(robots));

console.log(
  'Site build checks passed: routes, local assets, stable URLs, CSS-only landing, headings, navigation, code access, SEO, and foundation integrity.',
);
