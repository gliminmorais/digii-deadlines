(() => {
  const extensionApi = typeof browser === 'undefined' ? chrome : browser;
  const origin = location.origin;
  const pageSize = 20;
  const cacheMs = 2 * 60 * 1000;
  const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  const collections = new Map();
  let accountId;
  let accountScope;
  let cachedAccountName;
  const upcoming = ['upcomingAssignments', 'totalUpcomingAssignments'];
  const previous = ['previousAssignments', 'totalPreviousAssignments'];

  function session() {
    try {
      const user = JSON.parse(localStorage.getItem('userInfo'));
      const token = user?.token;
      if (typeof token !== 'string' || !token) return;
      let id = user.ukid;
      if (!/^\d+$/.test(id)) {
        const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        id = claims.ukid;
      }
      if (/^\d+$/.test(id)) return { token, id: String(id), name: cleanName(user.name) };
    } catch {
      // The portal has not established a usable session yet.
    }
  }

  function cleanName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  async function getJson(path, sync, timeoutMs = 12_000) {
    const signal = sync.controller.signal;
    const request = new AbortController();
    const cancel = () => request.abort();
    if (signal.aborted) cancel();
    signal.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, timeoutMs);
    try {
      const response = await fetch(origin + path, {
        headers: { 'Auth-Token': sync.token, Accept: 'application/json' },
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        signal: request.signal
      });
      if (!response.ok) throw new Error('DigiiCampus HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
    }
  }

  async function readAccountName(sync) {
    if (sync.name || cachedAccountName) return sync.name || cachedAccountName;
    try {
      const profile = await getJson('/api/userManagement/basicDetails', sync, 2_000);
      if (String(profile?.ukid) !== sync.id || accountScope !== sync.accountScope ||
          sync.controller.signal.aborted) return '';
      cachedAccountName = cleanName(profile.name);
      return cachedAccountName;
    } catch {
      return '';
    }
  }

  function deadline(value) {
    if (typeof value === 'number') {
      return { due: value < 1e12 ? value * 1000 : value, dateOnly: false };
    }
    if (typeof value !== 'string' || value.length > 80) return {};
    let date = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T');
    const named = /^([a-z]{3}) (\d{1,2}), (\d{4})$/i.exec(date);
    if (named && months.includes(named[1].toLowerCase())) {
      const month = String(months.indexOf(named[1].toLowerCase()) + 1).padStart(2, '0');
      date = named[3] + '-' + month + '-' + named[2].padStart(2, '0');
    }
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (dateOnly) return { due: Date.parse(date + 'T23:59:59.999+05:30'), dateOnly };
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(date)) return {};
    const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(date);
    return { due: Date.parse(zoned ? date : date + '+05:30'), dateOnly };
  }

  function assignment(row, course, bucket, past) {
    if (!row || !/^\d+$/.test(row.id) || typeof row.name !== 'string' || !row.name.trim()) return;
    const date = deadline(row.dueDate);
    const due = Number.isFinite(date.due) && Math.abs(date.due) <= 8.64e15 ? date.due : null;
    const submitted = typeof row.isSubmitted === 'boolean' ? row.isSubmitted
      : Boolean(row.submittedOn) ? true : null;
    const evaluated = row.isGraded === true || row.hasFacultyEvaluated === true;
    const finished = submitted === true || evaluated || row.dueDatePassed === true || (due !== null && due < Date.now());
    if (past ? bucket === upcoming && !finished : finished || due === null) return;
    const label = course.courseName || row.courseName || course.className || row.className;
    const score = value => typeof value === 'number' && Number.isFinite(value)
      ? String(value) : typeof value === 'string' ? value.trim().slice(0, 40) : '';
    return {
      href: origin + '/V2/#/classroom/' + course.id + '/student/assignment/' + row.id,
      title: row.name.trim().slice(0, 300),
      course: typeof label === 'string' ? label.trim().slice(0, 150) : '',
      courseId: String(course.id),
      due,
      dateOnly: date.dateOnly,
      submitted,
      grade: evaluated && row.showGrade !== false ? score(row.grade) : '',
      maximum: evaluated && row.showGrade !== false ? score(row.maximumMarks) : ''
    };
  }

  async function loadCourse(course, sync, items) {
    const buckets = (sync.past ? [upcoming, previous] : [upcoming]).map(spec => ({ spec, seen: new Set(), done: false }));
    let incomplete = false;
    for (let page = 1; page <= 100; page++) {
      const payload = await getJson(
        '/rest/classes/' + course.id + '/users/' + sync.id + '/assignments?page=' + page + '&perPage=' + pageSize,
        sync
      );
      for (const bucket of buckets) {
        if (bucket.done) continue;
        const [listKey, totalKey] = bucket.spec;
        const total = payload?.[totalKey];
        const rows = payload?.res?.[listKey] ?? payload?.[listKey] ?? (total === 0 ? [] : null);
        if (!Array.isArray(rows)) {
          bucket.done = true;
          incomplete = true;
          continue;
        }
        const previousSize = bucket.seen.size;
        for (const row of rows) {
          if (!row || !/^\d+$/.test(row.id)) continue;
          bucket.seen.add(String(row.id));
          const item = assignment(row, course, bucket.spec, sync.past);
          if (item) items.set(item.href, item);
        }
        bucket.done = Number.isInteger(total) ? bucket.seen.size >= total : rows.length === 0;
        if (!bucket.done && bucket.seen.size === previousSize) {
          bucket.done = true;
          incomplete = true;
        }
      }
      if (buckets.every(bucket => bucket.done)) {
        if (incomplete) throw new Error('Incomplete assignment history');
        return;
      }
    }
    throw new Error('Assignment pagination limit reached');
  }

  async function loadAll(sync) {
    try {
      const result = await getJson('/rest/classes/v1/classroom', sync);
      if (!Array.isArray(result)) throw new Error('Missing class list');
      const validCourses = result.filter(course => /^\d+$/.test(course?.id));
      const courses = new Map(validCourses.map(course => [String(course.id), course]));

      const items = new Map();
      let failed = 0;
      let loaded = 0;
      for (const course of courses.values()) {
        if (sync.controller.signal.aborted) break;
        try {
          await loadCourse(course, sync, items);
          loaded++;
        } catch {
          failed++;
        }
        if (loaded + failed < courses.size) await new Promise(resolve => setTimeout(resolve, 180));
      }
      failed += result.length - validCourses.length;
      return { state: 'ready', loaded, failed, items: [...items.values()] };
    } catch {
      return { state: 'error', items: [] };
    }
  }

  function update(force = false, past = false) {
    const user = session();
    if (accountId !== user?.id) {
      accountId = user?.id;
      accountScope = user ? crypto.randomUUID() : undefined;
      cachedAccountName = undefined;
    }
    for (const [view, cached] of collections) {
      if (cached.token !== user?.token || cached.id !== user?.id) {
        cached.controller.abort();
        collections.delete(view);
      }
    }
    if (!user) return;
    const active = collections.get(past);
    if (active?.pending) return active;
    if (active?.finished && !force && Date.now() - active.finished < cacheMs) return active;

    const sync = { ...user, accountScope, past, pending: true, controller: new AbortController() };
    collections.set(past, sync);
    sync.result = loadAll(sync).then(result => {
      const current = session();
      if (result.state !== 'ready' || result.failed || sync.controller.signal.aborted ||
          collections.get(past) !== sync || current?.token !== sync.token || current?.id !== sync.id) return result;
      const syncedAt = Date.now();
      sync.finished = syncedAt;
      void extensionApi.runtime.sendMessage?.({ type: 'digii-full-sync', syncedAt })?.catch(() => {});
      return { ...result, syncedAt };
    }).finally(() => {
      sync.pending = false;
    });
    return sync;
  }

  async function read(force, past) {
    const sync = update(force, past);
    if (!sync) return { state: 'sign-in', items: [] };
    const [result, accountName] = await Promise.all([sync.result, readAccountName(sync)]);
    const current = session();
    if (collections.get(past) !== sync || current?.token !== sync.token || current.id !== sync.id) {
      return { state: 'sign-in', items: [] };
    }
    return {
      ...result,
      accountScope: sync.accountScope,
      accountName,
      items: result.items.filter(item => past || item.due >= Date.now())
        .sort((a, b) => (past ? (b.due ?? -Infinity) - (a.due ?? -Infinity) : a.due - b.due) ||
          a.title.localeCompare(b.title))
    };
  }

  extensionApi.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'read-deadlines') return;
    read(message.refresh === true, message.past === true).then(respond, () => respond({ state: 'error', items: [] }));
    return true;
  });

  update();
  setInterval(() => {
    const current = session();
    const active = collections.get(false);
    if (active?.token !== current?.token || active?.id !== current?.id) update();
  }, 3000);
})();

