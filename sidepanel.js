const extensionApi = typeof browser === 'undefined' ? chrome : browser;
const campusUrl = 'https://snuc.digiicampus.com/';
const status = document.querySelector('#status');
const list = document.querySelector('#deadlines');
const historyList = document.querySelector('#history');
const emptyUpcoming = document.querySelector('#empty-upcoming');
const upcomingView = document.querySelector('#upcoming-view');
const pastView = document.querySelector('#past-view');
const refresh = document.querySelector('#refresh');
const campus = document.querySelector('#campus');
const theme = document.querySelector('#theme');
const timeZone = 'Asia/Kolkata';
const month = new Intl.DateTimeFormat('en-IN', { timeZone, month: 'short' });
const day = new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium' });
const time = new Intl.DateTimeFormat('en-IN', { timeZone, timeStyle: 'short' });
const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
let tabId;
let loadVersion = 0;
let past = false;
let openSubject;

if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('view') === 'tab') {
  document.documentElement.dataset.view = 'dashboard';
}

function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  theme.setAttribute('aria-pressed', String(!dark));
  theme.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
}

if (theme) {
  let initial;
  try { initial = localStorage.getItem('digii-theme'); } catch {}
  setTheme(initial ? initial === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  theme.addEventListener('click', () => {
    const dark = theme.getAttribute('aria-pressed') === 'true';
    const apply = () => {
      setTheme(dark);
      try { localStorage.setItem('digii-theme', dark ? 'dark' : 'light'); } catch {}
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const bounds = theme.getBoundingClientRect();
      document.documentElement.style.setProperty('--theme-origin-x', bounds.left + bounds.width / 2 + 'px');
      document.documentElement.style.setProperty('--theme-origin-y', bounds.top + bounds.height / 2 + 'px');
      document.startViewTransition(apply);
    } else {
      apply();
    }
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
    const control = event.target.closest('button, summary, .assignment, .history-assignment, footer a');
    if (!control) return;
    const bounds = control.getBoundingClientRect();
    control.style.setProperty('--pointer-x', event.clientX - bounds.left + 'px');
    control.style.setProperty('--pointer-y', event.clientY - bounds.top + 'px');
  }, { passive: true });
  document.addEventListener('click', event => {
    const control = event.target.closest('button, summary, a');
    if (!control || event.detail === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const pop = element('span', 'cursor-pop');
    pop.setAttribute('aria-hidden', 'true');
    pop.style.left = event.clientX + 'px';
    pop.style.top = event.clientY + 'px';
    document.body.append(pop);
    pop.animate([
      { transform: 'translate(-50%, -50%) scale(.25)', opacity: .8 },
      { transform: 'translate(-50%, -50%) scale(1.45)', opacity: 0 }
    ], { duration: 310, easing: 'cubic-bezier(.2,.75,.25,1)' }).finished.then(() => pop.remove(), () => pop.remove());
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function assignmentLink(className, item, text) {
  const link = element('a', className, text);
  link.href = item.href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.addEventListener('click', async event => {
    if (tabId === undefined || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try {
      await extensionApi.tabs.update(tabId, { url: item.href, active: true });
    } catch {
      status.textContent = 'Couldn’t open the assignment. Reopen your signed-in DigiiCampus tab and refresh.';
    }
  });
  return link;
}

function renderItem(item) {
  const row = element('li');
  const link = assignmentLink('assignment', item);
  const date = element('span', 'date');
  date.setAttribute('aria-hidden', 'true');
  const shownDue = displayDeadline(item);
  date.append(element('span', 'day', day.format(shownDue)), element('span', '', month.format(shownDue)));
  const content = element('span');
  const due = item.dateOnly ? fullDate.format(shownDue) : fullDate.format(shownDue) + ', ' + time.format(shownDue);
  content.append(
    element('span', 'title', item.title),
    element('span', 'details', [item.course, 'Due ' + due].filter(Boolean).join(' · '))
  );
  link.append(date, content);
  row.append(link);
  return row;
}

function displayDeadline(item) {
  return !item.dateOnly && item.due % 1000 === 0 && clock.format(item.due) === '00:00:00'
    ? item.due - 60_000 : item.due;
}

function historyItem(item) {
  const row = element('li', 'history-item');
  const link = assignmentLink('history-assignment', item);
  const metadata = element('span', 'history-meta');
  const label = item.submitted === true ? 'Submitted' : item.submitted === false ? 'Not submitted' : 'Status unavailable';
  const state = item.submitted === true ? 'submitted' : item.submitted === false ? 'missing' : 'unknown';
  metadata.append(element('span', 'submission ' + state, label));
  if (item.grade) {
    const score = item.maximum && /^\d+(?:\.\d+)?$/.test(item.grade)
      ? item.grade + ' / ' + item.maximum : item.grade;
    metadata.append(element('span', 'marks', 'Marks ' + score));
  }
  if (item.due !== null) metadata.append(element('span', 'past-date', 'Due ' + fullDate.format(displayDeadline(item))));
  link.append(element('span', 'title', item.title), metadata);
  row.append(link);
  return row;
}

function renderHistory(items) {
  const subjects = new Map();
  for (const item of items) {
    if (!subjects.has(item.courseId)) subjects.set(item.courseId, []);
    subjects.get(item.courseId).push(item);
  }
  const name = rows => rows.find(item => item.course)?.course || 'Subject ' + rows[0].courseId;
  const groups = [...subjects.values()].sort((a, b) => name(a).localeCompare(name(b)));
  historyList.replaceChildren(...groups.map(rows => {
    const id = rows[0].courseId;
    const group = element('details', 'subject');
    group.setAttribute('name', 'digii-history-subjects');
    group.open = openSubject === id;
    const header = element('summary', 'subject-heading');
    header.append(element('span', 'subject-name', name(rows)),
      element('span', 'subject-count', rows.length + (rows.length === 1 ? ' assignment' : ' assignments')));
    const assignments = element('ul', 'history-items');
    assignments.append(...rows.map(historyItem));
    group.append(header, assignments);
    group.addEventListener('toggle', () => {
      const siblings = [...historyList.children];
      if (!siblings.includes(group)) return;
      if (group.open) {
        openSubject = id;
        for (const sibling of siblings) {
          if (sibling !== group && sibling.open) sibling.open = false;
        }
      } else if (openSubject === id) {
        openSubject = undefined;
      }
    });
    return group;
  }));
  historyList.hidden = items.length === 0;
}

function selectView(showPast) {
  if (past === showPast) return;
  past = showPast;
  upcomingView.setAttribute('aria-pressed', String(!past));
  pastView.setAttribute('aria-pressed', String(past));
  pastView.parentElement?.setAttribute('data-view', past ? 'past' : 'upcoming');
  list.hidden = true;
  historyList.hidden = true;
  load(false, past ? 1 : -1);
}

async function load(force = false, slide = 0) {
  const version = ++loadVersion;
  refresh.setAttribute('aria-busy', 'true');
  status.removeAttribute('data-empty');
  emptyUpcoming.hidden = true;
  refresh.disabled = true;
  try {
    const tabs = await extensionApi.tabs.query({ url: campusUrl + '*', currentWindow: true });
    if (version !== loadVersion) return;
    const tab = tabs.find(candidate => candidate.active) ??
      tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
    tabId = tab?.id;
    list.replaceChildren();
    list.hidden = true;
    historyList.replaceChildren();
    historyList.hidden = true;
    if (!tab) {
      status.textContent = 'Open DigiiCampus and sign in to sync your courses.';
      return;
    }

    let result;
    status.textContent = past ? 'Loading past assignments…' : 'Syncing assignments across your courses…';
    try {
      result = await extensionApi.tabs.sendMessage(tabId, { type: 'read-deadlines', refresh: force, past });
    } catch {
      if (version === loadVersion) status.textContent = 'Reload your DigiiCampus tab to start syncing.';
      return;
    }
    if (version !== loadVersion) return;
    if (result?.state === 'sign-in') {
      status.textContent = 'Sign in to DigiiCampus, then reopen the dashboard.';
      return;
    }
    if (result?.state !== 'ready') {
      status.textContent = 'Couldn’t load your course list. Check your DigiiCampus session and try Refresh.';
      return;
    }
    const count = result.items.length;
    if (count === 0 && result.failed === 0 && result.loaded > 0 && !past) emptyUpcoming.hidden = false;
    else if (count === 0 && result.failed === 0) status.setAttribute('data-empty', '');
    const kind = past ? 'past' : 'upcoming';
    const summary = count ? count + ' ' + kind + (count === 1 ? ' assignment' : ' assignments') : 'No ' + kind + ' assignments';
    const coverage = result.failed
      ? ' · ' + result.failed + (result.failed === 1 ? ' course unavailable' : ' courses unavailable')
      : ' · ' + result.loaded + (result.loaded === 1 ? ' course checked' : ' courses checked');
    status.textContent = result.failed && !result.loaded && !count
      ? 'Couldn’t load assignments for your courses. Try Refresh.'
      : summary + coverage;
    if (past) renderHistory(result.items);
    else {
      list.replaceChildren(...result.items.map(renderItem));
      list.hidden = count === 0;
    }
    if (slide && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const content = !emptyUpcoming.hidden ? emptyUpcoming : count === 0 ? status : past ? historyList : list;
      content.animate?.([
        { transform: 'translateX(' + slide * 22 + 'px)', opacity: .35 },
        { transform: 'translateX(0)', opacity: 1 }
      ], { duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)' });
    }
  } catch {
    if (version === loadVersion) status.textContent = 'Couldn’t read the dashboard. Try refreshing.';
  } finally {
    if (version === loadVersion) {
      refresh.removeAttribute('aria-busy');
      refresh.disabled = false;
    }
  }
}

campus.addEventListener('click', async event => {
  if (tabId === undefined || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  try {
    await extensionApi.tabs.update(tabId, { active: true });
  } catch {
    await extensionApi.tabs.create({ url: campusUrl });
  }
});
refresh.addEventListener('click', () => load(true));
upcomingView.addEventListener('click', () => selectView(false));
pastView.addEventListener('click', () => selectView(true));
extensionApi.tabs.onActivated.addListener(() => load());
extensionApi.tabs.onRemoved.addListener(closedId => {
  if (closedId === tabId) load();
});
extensionApi.tabs.onUpdated.addListener((updatedId, change, tab) => {
  const isCampus = tab.url?.startsWith(campusUrl);
  if ((change.status === 'complete' && isCampus) || (updatedId === tabId && change.url && !isCampus)) load();
});
load();

