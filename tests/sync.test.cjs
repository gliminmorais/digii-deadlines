const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const script = () => readFileSync(join(__dirname, '../sync.js'), 'utf8');
const origin = 'https://snuc.digiicampus.com';
const token = 'header.' + Buffer.from('{"ukid":34}').toString('base64url') + '.signature';

function setup(respond, initialSession = { token, name: 'Ananya Rao' }) {
  let listener, tick;
  let session = initialSession;
  const calls = [];
  const messages = [];
  runInNewContext(script(), {
    Date, URL, atob, AbortSignal, AbortController, crypto: { randomUUID: require('node:crypto').randomUUID },
    location: { origin },
    localStorage: { getItem: () => JSON.stringify(session) },
    setInterval: callback => { tick = callback; },
    setTimeout: (callback, milliseconds) => milliseconds === 180 ? setImmediate(callback) : setTimeout(callback, milliseconds),
    clearTimeout,
    fetch: async (input, options) => {
      const url = new URL(input);
      assert.equal(url.origin, origin);
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['Auth-Token'], token);
      calls.push(url.pathname + url.search);
      const body = respond(url);
      return { ok: body !== null, status: body === null ? 403 : 200, json: async () => body };
    },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } },
      sendMessage: async message => { messages.push(message); } } }
  });
  return { calls, messages, setSession(value) { session = value; tick(); },
    read(refresh = false, past = false) {
      return new Promise(resolve => listener({ type: 'read-deadlines', refresh, past }, {}, resolve));
    }
  };
}

const upcoming = (rows, total) => ({ res: { upcomingAssignments: rows }, totalUpcomingAssignments: total });
const row = (id, name, dueDate, isSubmitted) => ({ id, name, dueDate, isSubmitted });

test('automatically loads and sorts multiple courses and follows pagination', async () => {
  const app = setup(url => {
    if (url.pathname.endsWith('/classroom')) return [{ id: 12, courseName: 'Systems' }, { id: 13 }];
    if (url.pathname.includes('/13/')) return upcoming([row(1, 'Essay', '2099-11-24')], 1);
    if (url.searchParams.get('page') === '1') return upcoming([
      row(1, 'Lab', '2099-11-25 23:59:00'), row(2, 'Already submitted', '2099-11-25', true)
    ], 3);
    return upcoming([row(3, 'Quiz prep', '2099-11-26T10:30:00+05:30')], 3);
  });
  const result = await app.read();
  assert.equal(result.state, 'ready');
  assert.equal(result.loaded, 2);
  assert.equal(app.calls.length, 4);
  assert.deepEqual(Array.from(result.items, item => item.title), ['Essay', 'Lab', 'Quiz prep']);
  assert.equal(result.items[1].course, 'Systems');
  assert.equal(result.items[1].due, Date.parse('2099-11-25T18:29:00Z'));
  assert.equal(result.items[1].href, origin + '/V2/#/classroom/12/student/assignment/1');
  assert.equal((await app.read()).items.length, 3);
  assert.equal(app.calls.length, 4);
  assert.ok(result.syncedAt <= Date.now());
  assert.deepEqual(Array.from(app.messages, message => [message.type, message.syncedAt]),
    [['digii-full-sync', result.syncedAt]]);
});

test('builds the SNUC assignment URL with the V2 portal path', async () => {
  const app = setup(url => url.pathname.endsWith('/classroom')
    ? [{ id: 669, courseName: 'Systems' }]
    : upcoming([row(1057, 'Lab report', '2099-11-25', false)], 1));
  const result = await app.read();
  assert.equal(result.items[0].href, origin + '/V2/#/classroom/669/student/assignment/1057');
});

test('reads previous assignment pages on demand and preserves submission and published grades', async () => {
  const app = setup(url => {
    if (url.pathname.endsWith('/classroom')) return [{ id: 12, courseName: 'Systems' }];
    const first = url.searchParams.get('page') === '1';
    return {
      totalUpcomingAssignments: 2, totalPreviousAssignments: 2,
      res: {
        upcomingAssignments: first ? [row(1, 'Due later', '2099-11-25', false), row(2, 'Sent early', '2099-11-25', true)] : [],
        previousAssignments: first ? [{ ...row(3, 'Graded lab', '2020-11-25', true), isGraded: true, grade: 0 }]
          : [{ ...row(4, 'Missed work', null, false), isGraded: true, showGrade: false, grade: 13 }]
      }
    };
  });
  assert.equal((await app.read()).items[0].title, 'Due later');
  assert.equal(app.calls.length, 2);
  const history = await app.read(false, true);
  assert.equal(history.failed, 0);
  assert.equal(app.calls.length, 5);
  assert.deepEqual(Array.from(history.items, item => [item.title, item.submitted, item.grade]), [
    ['Sent early', true, ''], ['Graded lab', true, '0'], ['Missed work', false, '']
  ]);
});

test('reports partial coverage and refreshes it; clears results on sign-out', async () => {
  let blocked = true;
  const app = setup(url => {
    if (url.pathname.endsWith('/classroom')) return [{ id: 12 }, { id: 13 }];
    if (url.pathname.includes('/13/') && blocked) return null;
    return upcoming([], 0);
  });
  const partial = await app.read();
  assert.equal(partial.failed, 1);
  assert.equal(partial.syncedAt, undefined);
  assert.equal(app.messages.length, 0);
  blocked = false;
  assert.equal((await app.read()).loaded, 2);
  app.setSession(null);
  assert.equal((await app.read()).state, 'sign-in');
});

test('retries a failed course-list request without a forced refresh', async () => {
  let blocked = true;
  const app = setup(() => blocked ? null : []);
  assert.equal((await app.read()).state, 'error');
  blocked = false;
  assert.equal((await app.read()).state, 'ready');
  assert.equal(app.calls.length, 2);
});

test('reports a course with a missing ID as unavailable and still loads valid courses', async () => {
  const app = setup(url => url.pathname.endsWith('/classroom')
    ? [{ id: 12 }, { courseName: 'Missing ID' }]
    : upcoming([row(1, 'Lab', '2099-11-25')], 1));
  const result = await app.read();
  assert.equal(result.loaded, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.items[0].title, 'Lab');
  assert.equal(result.syncedAt, undefined);
  assert.equal(app.messages.length, 0);
});

test('uses one opaque scope for both views and changes it when the account changes', async () => {
  const app = setup(() => [], { token, ukid: 34, name: 'Ananya Rao' });
  const first = (await app.read()).accountScope;
  assert.equal(typeof first, 'string');
  assert.equal((await app.read(false, true)).accountScope, first);
  app.setSession({ token, ukid: 35, name: 'Asha Menon' });
  const second = (await app.read()).accountScope;
  assert.equal(typeof second, 'string');
  assert.notEqual(second, first);
});

test('reads only the account name from a matching profile and clears it on a switch', async () => {
  let profile = { ukid: 34, name: '  Ananya   Rao ', email: 'hidden@example.com' };
  const app = setup(url => url.pathname.endsWith('/basicDetails') ? profile : [], { token, ukid: 34 });
  const result = await app.read();
  assert.equal(result.accountName, 'Ananya Rao');
  assert.ok(!JSON.stringify(result).includes(profile.email));
  await app.read(false, true);
  assert.equal(app.calls.filter(path => path.endsWith('/basicDetails')).length, 1);
  app.setSession({ token, ukid: 35 });
  assert.equal((await app.read()).accountName, '');
  profile = null;
  assert.equal((await app.read()).state, 'ready');
  app.setSession({ token, ukid: 35, name: 'Asha Menon' });
  assert.equal((await app.read(true)).accountName, 'Asha Menon');
});

test('starts automatically if the user signs in after opening DigiiCampus', async () => {
  const app = setup(() => [], null);
  assert.equal((await app.read()).state, 'sign-in');
  assert.equal(app.calls.length, 0);
  app.setSession({ token, name: 'Ananya Rao' });
  assert.equal((await app.read()).state, 'ready');
  assert.equal(app.calls.length, 1);
});

