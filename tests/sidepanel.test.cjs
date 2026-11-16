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

async function render(tabs, response) {
  const nodes = new Map(['status', 'deadlines', 'refresh', 'campus', 'history', 'upcoming-view', 'past-view']
    .map(id => ['#' + id, new Element()]));
  runInNewContext(script, {
    matchMedia: () => ({ matches: false }),
    document: { querySelector: id => nodes.get(id), createElement: () => new Element() },
    chrome: { tabs: {
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
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

test('opens past assignments in collapsed subject groups and shows zero marks', async () => {
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
  assert.match(status.textContent, /2 past assignments/);
  const [design, systems] = nodes.get('#history').children;
  assert.equal(design.open, false);
  assert.equal(design.children[0].children[0].textContent, 'Design');
  assert.equal(design.children[1].children[0].children[1].children[0].textContent, 'Not submitted');
  assert.equal(systems.children[1].children[0].children[1].children[1].textContent, 'Marks 0 / 10');
});

test('shows linked assignments and formats due times in IST', async () => {
  const href = portal + '#/classroom/12/student/assignment/56';
  const [status, list] = await render([{ id: 2 }, { id: 3, active: true }], {
    state: 'ready', loaded: 2, failed: 0,
    items: [{ href, title: 'Lab report', course: 'Systems', due: Date.parse('2099-11-25T18:29:00Z') }]
  });
  assert.match(status.textContent, /1 upcoming assignment/);
  assert.equal(list.hidden, false);
  const link = list.children[0].children[0];
  assert.equal(link.href, href);
  assert.equal(link.children[1].children[0].textContent, 'Lab report');
  assert.match(link.children[1].children[1].textContent, /Systems.*25 Nov 2099.*11:59/i);
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
  const [midnight, civil] = list.children.map(row => row.children[0]);
  assert.equal(midnight.children[0].children[0].textContent, '16');
  assert.match(midnight.children[1].children[1].textContent, /16 Nov 2026.*11:59\s*pm/i);
  assert.equal(civil.children[0].children[0].textContent, '17');
  assert.match(civil.children[1].children[1].textContent, /Due 17 Nov 2026$/);
});

