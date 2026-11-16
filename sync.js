(() => {
  const origin = location.origin;
  const pageSize = 20;
  const cacheMs = 2 * 60 * 1000;
  const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  let active;

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
      if (/^\d+$/.test(id)) return { token, id: String(id) };
    } catch {
      // The portal has not established a usable session yet.
    }
  }

  async function getJson(path, sync) {
    const response = await fetch(origin + path, {
      headers: { 'Auth-Token': sync.token, Accept: 'application/json' },
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.any([sync.controller.signal, AbortSignal.timeout(12000)])
    });
    if (!response.ok) throw new Error('DigiiCampus HTTP ' + response.status);
    return response.json();
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

  function assignment(row, course) {
    if (!row || !/^\d+$/.test(row.id) || typeof row.name !== 'string' || !row.name.trim()) return;
    if (row.isSubmitted === true || row.isGraded === true || row.dueDatePassed === true) return;
    const date = deadline(row.dueDate);
    if (!Number.isFinite(date.due) || Math.abs(date.due) > 8.64e15) return;
    const label = course.courseName || row.courseName || course.className || row.className;
    return {
      href: origin + '/#/classroom/' + course.id + '/student/assignment/' + row.id,
      title: row.name.trim().slice(0, 300),
      course: typeof label === 'string' ? label.trim().slice(0, 150) : '',
      ...date
    };
  }

  async function loadCourse(course, sync, items) {
    const seen = new Set();
    for (let page = 1; page <= 100; page++) {
      const payload = await getJson(
        '/rest/classes/' + course.id + '/users/' + sync.id + '/assignments?page=' + page + '&perPage=' + pageSize,
        sync
      );
      const total = payload?.totalUpcomingAssignments;
      const rows = payload?.res?.upcomingAssignments ?? payload?.upcomingAssignments;
      if (total === 0 && (rows == null || rows.length === 0)) return;
      if (!Array.isArray(rows)) throw new Error('Missing assignment list');
      const previousSize = seen.size;
      for (const row of rows) {
        if (!row || !/^\d+$/.test(row.id)) continue;
        seen.add(String(row.id));
        const item = assignment(row, course);
        if (item) items.set(item.href, item);
      }
      if (Number.isInteger(total) && seen.size >= total) return;
      if (!Number.isInteger(total) && rows.length === 0) return;
      if (seen.size === previousSize) throw new Error('Assignment pagination stopped early');
    }
    throw new Error('Assignment pagination limit reached');
  }

  async function loadAll(sync) {
    try {
      const result = await getJson('/rest/classes/v1/classroom', sync);
      if (!Array.isArray(result)) throw new Error('Missing class list');
      const courses = new Map(result.filter(course => /^\d+$/.test(course?.id))
        .map(course => [String(course.id), course]));
      if (result.length && !courses.size) throw new Error('Missing class IDs');

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
      return { state: 'ready', loaded, failed, items: [...items.values()] };
    } catch {
      return { state: 'error', items: [] };
    }
  }

  function update(force = false) {
    const user = session();
    if (active && (active.token !== user?.token || active.id !== user?.id)) {
      active.controller.abort();
      active = undefined;
    }
    if (!user) return;
    if (active?.pending) return active;
    if (active && !force && Date.now() - active.finished < cacheMs) return active;

    const sync = { ...user, pending: true, controller: new AbortController() };
    active = sync;
    sync.result = loadAll(sync).finally(() => {
      sync.pending = false;
      sync.finished = Date.now();
    });
    return sync;
  }

  async function read(force) {
    const sync = update(force);
    if (!sync) return { state: 'sign-in', items: [] };
    const result = await sync.result;
    const current = session();
    if (active !== sync || current?.token !== sync.token || current.id !== sync.id) {
      return { state: 'sign-in', items: [] };
    }
    return {
      ...result,
      items: result.items.filter(item => item.due >= Date.now())
        .sort((a, b) => a.due - b.due || a.title.localeCompare(b.title))
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'read-deadlines') return;
    read(message.refresh === true).then(respond, () => respond({ state: 'error', items: [] }));
    return true;
  });

  update();
  setInterval(() => {
    const current = session();
    if (active?.token !== current?.token || active?.id !== current?.id) update();
  }, 3000);
})();

