#!/usr/bin/env node

import assert from 'node:assert/strict';
import {access, readFile, readdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const origin = 'https://easel.billynoyes.co.uk';
const sections = [
  'quick-start',
  'development',
  'production',
  'bundles',
  'configuration',
  'integrations',
  'safety',
  'troubleshooting',
  'examples',
];
const pages = new Map([
  ['/', await readFile('dist/index.html', 'utf8')],
  ['/docs/', await readFile('dist/docs/index.html', 'utf8')],
]);
const idsFor = (html) => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const tags = (html, name) => [
  ...html.matchAll(new RegExp(`<${name}\\b(?:[^"'<>]|"[^"]*"|'[^']*')*>`, 'g')),
];
const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const localPath = (url) =>
  resolve('dist', `.${url.pathname}${url.pathname.endsWith('/') ? 'index.html' : ''}`);

await Promise.all([access('dist/assets/main.js'), access('dist/assets/site.css')]);

for (const [route, html] of pages) {
  const pageURL = new URL(route, origin);
  const ids = idsFor(html);
  assert.equal(new Set(ids).size, ids.length, `${route}: unique IDs`);
  assert.equal(tags(html, 'h1').length, 1, `${route}: one h1`);
  assert.equal(attribute(tags(html, 'html')[0][0], 'lang'), 'en');
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/);
  assert.equal(tags(html, 'header').length, 1, `${route}: header landmark`);
  assert.equal(tags(html, 'footer').length, 1, `${route}: footer landmark`);
  assert(
    tags(html, 'a').some(([tag]) => attribute(tag, 'href') === '#main'),
    `${route}: skip link`,
  );
  assert.doesNotMatch(html, /vbg-|vercel-brand|<style\b|\sstyle=/);
  for (const [heading] of [
    ...tags(html, 'h1'),
    ...tags(html, 'h2'),
    ...tags(html, 'h3'),
  ]) {
    const classes = new Set(attribute(heading, 'class')?.split(/\s+/));
    for (const utility of ['font-heading', 'font-bold', 'tracking-normal']) {
      assert(classes.has(utility), `${route}: heading uses ${utility}`);
    }
  }
  assert.doesNotMatch(html, /file:\/\/|bg-canvas|token-(?:keyword|string)|theme-switch/);

  const links = tags(html, 'link').map(([tag]) => tag);
  const canonical = links.find((tag) => attribute(tag, 'rel') === 'canonical');
  assert(canonical, `${route}: canonical URL`);
  assert.equal(attribute(canonical, 'href'), pageURL.href);
  assert.equal(
    links.filter((tag) => attribute(tag, 'rel') === 'stylesheet').length,
    1,
    `${route}: one Tailwind stylesheet`,
  );
  assert.equal(
    links.filter((tag) => attribute(tag, 'href')?.endsWith('/assets/site.css')).length,
    1,
    `${route}: stable CSS`,
  );
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  for (const font of [
    'inter_n7.02711e6b374660cfc7915d1afc1c204e633421e4.woff2',
    'inter_n4.b2a3f24c19b4de56e8871f609e73ca7f6d2e2bb9.woff2',
  ]) {
    const preload = links.find(
      (tag) => new URL(attribute(tag, 'href'), pageURL).pathname === `/fonts/${font}`,
    );
    assert(preload, `${route}: preload ${font}`);
    assert.equal(attribute(preload, 'rel'), 'preload');
    assert.equal(attribute(preload, 'as'), 'font');
    assert.match(preload, /\scrossorigin(?:[\s=>])/);
  }
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
    const bodyClasses = new Set(
      attribute(tags(html, 'body')[0][0], 'class')?.split(/\s+/),
    );
    assert(bodyClasses.has('min-h-dvh'), 'Landing fills the visible viewport');
    assert.doesNotMatch(
      html,
      /\b(?:overflow-hidden|overflow-y-hidden|overflow-clip)\b/,
      'Landing can scroll rather than clip content on small or zoomed screens',
    );
    assert.doesNotMatch(html, /x-data|@click|data-code-block[^>]*x-data|<button/);
    assert.match(html, /<h1[^>]*>\s*Vite Plugin for Shopify Liquid Themes\.\s*<\/h1>/);
    assert.match(html, /href="\/docs\/"[^>]*>\s*Get started/);
    const examples = tags(html, 'div').find(([tag]) =>
      /\sdata-home-examples(?:\s|>)/.test(tag),
    );
    assert(examples, 'Landing pairs the CLI preview with the Vite config');
    const columns = new Set(attribute(examples[0], 'class')?.split(/\s+/));
    assert(columns.has('grid-cols-1'), 'Landing examples stack on small screens');
    assert(columns.has('lg:grid-cols-2'), 'Landing examples sit side by side on desktop');
    assert.equal(tags(html, 'pre').length, 2, 'Two static landing examples');
    const terminal = tags(html, 'pre').find(([tag]) =>
      /\sdata-terminal-preview(?:\s|>)/.test(tag),
    );
    assert(terminal, 'Static terminal preview is present');
    assert.equal(attribute(terminal[0], 'aria-describedby'), 'cli-preview-note');
    assert.match(html, /npm create easel-theme@latest \./);
    assert.match(html, /create-easel-theme/);
    assert.doesNotMatch(
      html,
      /CLI preview|Preview only|npm release coming soon|Try the local CLI/,
    );
    assert.match(
      html,
      /href="https:\/\/www\.npmjs\.com\/package\/create-easel-theme"[^>]*>\s*create-easel-theme on npm/,
    );
    assert.match(
      html,
      /href="https:\/\/www\.npmjs\.com\/package\/vite-plugin-shopify-easel"[^>]*>\s*vite-plugin-shopify-easel on npm/,
    );
    assert.match(html, /plugins: \[easel\(\)\]/);
  } else {
    const documentClasses = new Set(
      attribute(tags(html, 'html')[0][0], 'class')?.split(/\s+/),
    );
    assert(documentClasses.has('scroll-smooth'), 'Docs anchors scroll smoothly');
    assert(
      documentClasses.has('motion-reduce:scroll-auto'),
      'Docs respect reduced motion',
    );
    assert.equal(runtimeScripts.length, 1, 'Docs has one runtime entry');
    assert.match(
      html,
      /href="https:\/\/www\.npmjs\.com\/package\/create-easel-theme"[^>]*>create-easel-theme scaffolder/,
    );
    assert.match(html, /npm create easel-theme@latest \./);
    assert.match(html, /Language:[\s\S]*TypeScript or JavaScript/);
    assert.match(html, /UI tools:[\s\S]*Alpine, React, or Vue/);
    assert.match(html, /Styling:[\s\S]*plain CSS\s+or Tailwind CSS/);
    assert.match(html, /Install:[\s\S]*npm,\s+pnpm, Yarn, or Bun/);
    assert.match(html, /existing project files are never overwritten/);
    assert.match(html, /replace the dot with a name such as[\s\S]*my-theme/);
    assert.match(
      html,
      /href="https:\/\/www\.npmjs\.com\/package\/vite-plugin-shopify-easel"[^>]*[\s\S]*Install vite-plugin-shopify-easel/,
    );
    assert.equal(attribute(runtimeScripts[0], 'type'), 'module');
    assert.equal(
      new URL(attribute(runtimeScripts[0], 'src'), pageURL).pathname,
      '/assets/main.js',
      'Docs uses legacy stable JS URL',
    );
    for (const id of sections) {
      assert(ids.includes(id), `Preserved section: ${id}`);
      const section = tags(html, 'section').find(([tag]) => attribute(tag, 'id') === id);
      assert(section, `Top-level section: ${id}`);
      assert(
        new Set(attribute(section[0], 'class')?.split(/\s+/)).has('[&+section]:mt-16'),
        `${id}: 64px gap from the preceding section`,
      );
      assert.match(html, new RegExp(`activeSection === '${id}' \\? 'location' : null`));
    }
    const sidebar = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[0];
    assert(sidebar, 'Desktop navigation is present');
    for (const id of sections) assert(sidebar.includes(`href="#${id}"`));
    for (const topic of [
      'assets',
      'cors',
      'network',
      'reload',
      'production',
      'ownership',
      'entries',
      'frameworks',
      'report',
    ]) {
      const id = `troubleshooting-${topic}`;
      const heading = tags(html, 'h3').find(([tag]) => attribute(tag, 'id') === id);
      assert(heading, `Troubleshooting topic: ${topic}`);
      assert.equal(attribute(heading[0], 'tabindex'), '-1', `${topic}: focusable target`);
      assert(html.includes(`href="#${id}"`), `${topic}: jump link`);
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
    assert.match(html, /Use one terminal \(optional\)/);
    assert.match(html, /npm install --save-dev concurrently/);
    assert.match(
      html,
      /"dev:shopify": "shopify theme dev --notify \.easel\/shopify-ready"/,
    );
    assert.match(html, /"dev:theme": "concurrently --kill-others --names vite,shopify/);
    assert.match(html, /npm run dev:theme/);
    assert.match(html, /initial authentication or\s+interactive troubleshooting/);
  }

  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
  assert(footer, `${route}: footer content`);
  assert.match(
    footer,
    /Built by[\s\S]*Billy Noyes[\s\S]*An independent project with no Shopify sponsorship or endorsement\./,
    `${route}: author credit and independence statement`,
  );
  assert.match(footer, /href="https:\/\/billynoyes\.co\.uk\/"/, `${route}: author link`);
}

for (const name of (await readdir('public/fonts')).filter((name) =>
  name.endsWith('.woff2'),
)) {
  const source = await readFile(`public/fonts/${name}`);
  assert.equal(source.toString('ascii', 0, 4), 'wOF2', `${name}: valid WOFF2 signature`);
  assert.equal(source.readUInt32BE(8), source.length, `${name}: complete font file`);
  assert.deepEqual(
    await readFile(`dist/fonts/${name}`),
    source,
    `${name}: unchanged asset`,
  );
}
await access('dist/fonts/Inter-LICENSE.txt');

const assets = await readdir('dist/assets');
assert(!assets.some((file) => /^(?:main|site)-[\w-]+\.(?:js|css)$/.test(file)));
assert(!assets.includes('vercel-brand.css'), 'No separate styling framework is shipped');
const stylesheet = await readFile('src/style.css', 'utf8');
const customRules = stylesheet
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@import ['"]tailwindcss['"];|(?:@font-face|@theme|:root)\s*\{[^{}]*\}/g, '')
  .trim();
assert.equal(customRules, '', 'CSS only defines Tailwind theme tokens and font faces');
assert.doesNotMatch(await readFile('dist/assets/site.css', 'utf8'), /vbg-/);

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
  'Site build checks passed: routes, local assets, stable URLs, CSS-only landing, headings, navigation, code access, SEO, and Tailwind-only styling.',
);
