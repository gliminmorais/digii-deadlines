const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const script = readFileSync(join(__dirname, '../background.js'), 'utf8');

function simulate(target, apiName, extras = {}) {
  const manifestFile = target === 'chromium' ? 'manifest.json' : 'manifests/' + target + '.json';
  const manifest = JSON.parse(readFileSync(join(__dirname, '..', manifestFile), 'utf8'));
  const listeners = {};
  const opened = [];
  const api = {
    runtime: {
      getManifest: () => manifest,
      getURL: path => 'extension://example/' + path,
      onInstalled: { addListener: fn => { listeners.install = fn; } },
      onMessage: { addListener: fn => { listeners.message = fn; } }
    },
    action: { onClicked: { addListener: fn => { listeners.click = fn; } } },
    tabs: { create: async ({ url }) => { opened.push(url); } },
    ...extras
  };
  runInNewContext(script, { [apiName]: api, console });
  return { listeners, opened, manifest };
}

test('Chrome and Edge register the native side panel for toolbar clicks', async () => {
  let enable;
  const { listeners, opened } = simulate('chromium', 'chrome', {
    sidePanel: { setPanelBehavior: async options => { enable = options.openPanelOnActionClick; } }
  });
  assert.equal(listeners.click, undefined);
  await listeners.install();
  assert.equal(enable, true);
  assert.deepEqual(opened, []);
});

test('records only the newest timestamp from a DigiiCampus sync', async () => {
  const timestamps = [];
  const key = 'lastSuccessfulDigiiSync';
  const { listeners } = simulate('portable', 'chrome', { storage: { local: {
    get: async () => ({ [key]: timestamps.at(-1) }),
    set: async value => { timestamps.push(value[key]); }
  } } });
  const newer = Date.now() - 2000;
  const message = syncedAt => ({ type: 'digii-full-sync', syncedAt });
  const sender = { url: 'https://snuc.digiicampus.com/V2/' };
  const send = syncedAt => new Promise(resolve => listeners.message(message(syncedAt), sender, resolve));
  assert.equal(listeners.message(message(newer), { url: 'https://example.com/' }, () => {}), undefined);
  await Promise.all([send(newer), send(newer - 1000)]);
  assert.deepEqual(timestamps, [newer]);
});

test('Firefox opens the native sidebar directly from a toolbar click', async () => {
  let openedSidebar = false;
  const { listeners, opened, manifest } = simulate('firefox', 'browser', {
    sidebarAction: { open: async () => { openedSidebar = true; } }
  });
  assert.equal(manifest.sidebar_action.default_panel, 'sidepanel.html');
  const operation = listeners.click();
  assert.equal(openedSidebar, true);
  await operation;
  assert.deepEqual(opened, []);
});

test('the Firefox route opens a dashboard tab when the sidebar is unavailable', async () => {
  for (const extras of [{}, { sidebarAction: { open: async () => { throw Error('Sidebar unavailable'); } } }]) {
    const { listeners, opened } = simulate('firefox', 'browser', extras);
    await listeners.click();
    assert.deepEqual(opened, ['extension://example/sidepanel.html?view=tab']);
  }
});

test('portable Chromium and Safari resources use the dashboard tab', async () => {
  for (const [target, namespace] of [['portable', 'chrome'], ['safari', 'browser']]) {
    const { listeners, opened, manifest } = simulate(target, namespace);
    assert.equal(manifest.side_panel, undefined);
    assert.equal(manifest.permissions?.includes('sidePanel') ?? false, false);
    await listeners.click();
    assert.deepEqual(opened, ['extension://example/sidepanel.html?view=tab']);
  }
});
