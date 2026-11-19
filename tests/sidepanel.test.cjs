const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const script = readFileSync(join(__dirname, '../sidepanel.js'), 'utf8');
const portal = 'https://snuc.digiicampus.com/';

class Element {
  children = [];
  attributes = new Map();
  listeners = new Map();
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  getAttribute(name) { return this.attributes.get(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(event, listener) { this.listeners.set(event, listener); }
}

function textOf(node) {
  if (typeof node === 'string') return node;
  return (node.textContent ?? '') + node.children.map(textOf).join('');
}

async function render(tabs, response, update, now = Date.now()) {
  const nodes = new Map(['status', 'sync-time', 'sync-summary', 'refresh-notice', 'deadlines', 'refresh', 'campus',
    'history', 'upcoming-view', 'past-view', 'empty-upcoming']
    .map(id => ['#' + id, new Element()]));
  runInNewContext(script, {
    Date: class extends Date { static now() { return now; } },
    matchMedia: () => ({ matches: false }),
    document: { querySelector: id => nodes.get(id), createElement: () => new Element() },
    chrome: { tabs: {
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
      update,
      query: async query => {
      assert.equal(query.url, portal + '*');
      return tabs;
    }, sendMessage: async (id, message) => {
      assert.equal(id, 3);
      assert.equal(message.type, 'read-deadlines');
      return typeof response === 'function' ? response(message) : response;
    } } }
  });
  await new Promise(resolve => setImmediate(resolve));
  return [nodes.get('#status'), nodes.get('#deadlines'), nodes];
}

test('explains how to start when a portal tab is missing', async () => {
  const [status, list] = await render([]);
  assert.match(status.textContent, /Open DigiiCampus/);
  assert.equal(list.hidden, true);
});

test('shows whole-row assignment links and keeps only one past subject open', async () => {
  const requests = [];
  const [status, list, nodes] = await render([{ id: 3 }], message => {
    requests.push(message.past);
    return { state: 'ready', loaded: 2, failed: 0, items: message.past ? [
      { courseId: '12', course: 'Systems', title: 'Lab', submitted: true, grade: '0', maximum: '10', due: null },
      { courseId: '15', course: 'Design', title: 'Draft', submitted: false, due: null }
    ] : [] };
  });
  assert.deepEqual(requests, [false]);
  nodes.get('#past-view').listeners.get('click')();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes.get('#past-view').getAttribute('aria-pressed'), 'true');
  assert.equal(list.hidden, true);
  assert.equal(status.textContent, '2 past');
  const [design, systems] = nodes.get('#history').children;
  assert.equal(design.open, false);
  assert.equal(design.children[0].children[0].textContent, 'Design');
  const draft = design.children[1].children[0].children[0];
  const lab = systems.children[1].children[0].children[0];
  assert.equal(draft.className, 'history-assignment');
  assert.equal(draft.children[1].children[0].textContent, 'Not submitted');
  assert.equal(lab.children[1].children[1].textContent, 'Marks 0 / 10');
  design.open = true;
  design.listeners.get('toggle')();
  systems.open = true;
  systems.listeners.get('toggle')();
  assert.equal(design.open, false);
  assert.equal(systems.open, true);
  design.listeners.get('toggle')();
  await nodes.get('#refresh').listeners.get('click')();
  const [rerenderedDesign, rerenderedSystems] = nodes.get('#history').children;
  assert.equal(rerenderedDesign.open, false);
  assert.equal(rerenderedSystems.open, true);
});

test('shows linked assignments and formats due times in IST', async () => {
  const href = portal + 'V2/#/classroom/12/student/assignment/56';
  const navigation = [];
  const [status, list] = await render([{ id: 2 }, { id: 3, active: true }], {
    state: 'ready', loaded: 2, failed: 0,
    items: [{ href, title: 'Lab report', course: 'Systems', due: Date.parse('2099-11-25T18:29:00Z') }]
  }, async (id, options) => navigation.push([id, options.url, options.active]));
  assert.equal(status.textContent, '1 upcoming');
  assert.equal(status.title, '1 upcoming assignment · 2 courses checked');
  assert.equal(list.hidden, false);
  const link = list.children[0].children[1].children[0].children[0];
  assert.equal(link.href, href);
  assert.equal(link.children[1].children[0].textContent, 'Lab report');
  const details = link.children[1].children[1];
  assert.equal(details.children[0].className, 'assignment-course');
  assert.equal(details.children.at(-1).className, 'assignment-due');
  assert.match(textOf(details), /Systems.*25 Nov 2099.*11:59/i);
  let intercepted = false;
  await link.listeners.get('click')({ preventDefault() { intercepted = true; } });
  assert.equal(intercepted, true);
  assert.deepEqual(navigation, [[3, href, true]]);
});

test('shows midnight IST on the previous day at 11:59 pm and preserves date-only deadlines', async () => {
  const due = Date.parse('2026-11-16T18:30:00Z');
  const [status, list] = await render([{ id: 3 }], {
    state: 'ready', loaded: 1, failed: 0,
    items: [
      { title: 'Midnight deadline', course: 'Systems', due },
      { title: 'Date only', course: 'Systems', due, dateOnly: true }
    ]
  });
  const [midnight, civil] = list.children[0].children[1].children.map(row => row.children[0]);
  assert.equal(midnight.children[0].children[0].textContent, '16');
  assert.match(textOf(midnight.children[1].children[1]), /16 Nov 2026.*11:59\s*pm/i);
  assert.equal(civil.children[0].children[0].textContent, '17');
  assert.match(textOf(civil.children[1].children[1]), /Due 17 Nov 2026$/);
});

test('groups upcoming assignments by IST day and keeps the last full sync during partial results', async () => {
  const now = Date.parse('2026-11-20T12:00:00+05:30');
  const syncedAt = now - 60_000;
  const items = [
    { title: 'Midnight', due: Date.parse('2026-11-21T00:00:00+05:30') },
    { title: 'Tomorrow', due: Date.parse('2026-11-21T16:00:00+05:30') },
    { title: 'Later', due: Date.parse('2026-11-23T16:00:00+05:30') }
  ];
  let partial = false;
  const [status, list, nodes] = await render([{ id: 3 }], () => ({
    state: 'ready', loaded: 2, failed: partial ? 1 : 0,
    items: partial ? items.slice(0, 1) : items, syncedAt: partial ? null : syncedAt
  }), undefined, now);
  assert.deepEqual(Array.from(list.children, group => group.children[0].textContent), ['Today', 'Tomorrow', 'Later']);
  assert.equal(nodes.get('#sync-time').dateTime, new Date(syncedAt).toISOString());
  partial = true;
  await nodes.get('#refresh').listeners.get('click')();
  assert.equal(status.textContent, '3 upcoming');
  assert.match(nodes.get('#refresh-notice').textContent, /1 course unavailable.*try again/i);
  assert.equal(list.children.length, 3);
  assert.equal(nodes.get('#sync-time').dateTime, new Date(syncedAt).toISOString());
});

test('keeps the same assignment cards during an in-progress refresh and a refresh error', async () => {
  const full = { state: 'ready', loaded: 1, failed: 0, items: [{ title: 'Lab', due: Date.parse('2099-11-23') }] };
  let response = full;
  const [, list, nodes] = await render([{ id: 3 }], () => response);
  const group = list.children[0];
  const refresh = nodes.get('#refresh').listeners.get('click');
  let finish;
  response = new Promise(resolve => { finish = resolve; });
  const pending = refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(list.hidden, false);
  assert.equal(list.children[0], group);
  finish({ state: 'error' });
  await pending;
  assert.equal(list.children[0], group);
  assert.match(nodes.get('#refresh-notice').textContent, /refresh failed.*try again/i);
  response = { ...full, items: [{ title: 'Updated lab', due: Date.parse('2099-11-24') }] };
  await refresh();
  assert.match(textOf(list), /Updated lab/);
  assert.equal(nodes.get('#refresh-notice').hidden, true);
  response = { state: 'sign-in' };
  await refresh();
  assert.equal(list.hidden, true);
  assert.equal(list.children.length, 0);
});
