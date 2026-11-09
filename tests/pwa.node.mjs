import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { URL } from 'node:url';

const read = (path) => readFileSync(new URL(`../public/${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../public/${path}`, import.meta.url));

test('manifest is valid and installable', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.name, 'JoulesTracker');
  assert.equal(manifest.display, 'fullscreen');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  const pngIcons = manifest.icons.filter((icon) => icon.type === 'image/png');
  const sizes = new Set(pngIcons.map((icon) => icon.sizes));
  assert.ok(sizes.has('192x192'), 'manifest needs a 192x192 png icon');
  assert.ok(sizes.has('512x512'), 'manifest needs a 512x512 png icon');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.ok(exists(icon.src.replace(/^\//, '')), `icon file missing: ${icon.src}`);
  }
});

test('service worker precaches the shell and never caches the API', () => {
  const sw = read('sw.js');
  assert.ok(sw.includes('serviceWorker') || sw.includes('addEventListener'), 'sw must register listeners');
  for (const asset of ['/index.html', '/app.js', '/styles.css', '/manifest.webmanifest']) {
    assert.ok(sw.includes(`'${asset}'`), `shell must precache ${asset}`);
  }
  assert.ok(sw.includes("/api/"), 'sw must treat API paths separately');
  assert.ok(!sw.includes('cache.put(request, response'), 'API responses must not be cached');
  const swRegistered = read('app.js').includes("serviceWorker.register('/sw.js')");
  assert.ok(swRegistered, 'app.js must register sw.js');
});

test('index.html links the manifest', () => {
  const html = read('index.html');
  assert.ok(html.includes('rel="manifest"'), 'missing manifest link');
  assert.ok(html.includes('manifest.webmanifest'), 'manifest link must point to manifest.webmanifest');
});
