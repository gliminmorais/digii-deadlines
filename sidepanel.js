const extensionApi = typeof browser === 'undefined' ? chrome : browser;
const campusUrl = 'https://snuc.digiicampus.com/';
const status = document.querySelector('#status');
const syncTime = document.querySelector('#sync-time');
const syncSummary = document.querySelector('#sync-summary');
const refreshNotice = document.querySelector('#refresh-notice');
const syncStorageKey = 'lastSuccessfulDigiiSync';
const list = document.querySelector('#deadlines');
const historyList = document.querySelector('#history');
const emptyUpcoming = document.querySelector('#empty-upcoming');
const upcomingView = document.querySelector('#upcoming-view');
const pastView = document.querySelector('#past-view');
const refresh = document.querySelector('#refresh');
const refreshIcon = document.querySelector('.refresh-icon');
const campus = document.querySelector('#campus');
const theme = document.querySelector('#theme');
const signedInAccount = document.querySelector('#signed-in-account');
const accountNameLabel = document.querySelector('#account-name');
const timeZone = 'Asia/Kolkata';
const month = new Intl.DateTimeFormat('en-IN', { timeZone, month: 'short' });
const day = new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium' });
const shortDate = new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('en-IN', { timeZone, timeStyle: 'short' });
const clock = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
let tabId;
let accountScope;
let loadVersion = 0;
let past = false;
let openSubject;
let lastSuccessfulSync = 0;
const loadedViews = new Map();
let visibleResult;

function showLastSync(timestamp) {
  const now = Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < lastSuccessfulSync || timestamp <= 0 || timestamp > now) return;
  lastSuccessfulSync = timestamp;
  syncTime.dateTime = new Date(timestamp).toISOString();
  const shownTime = time.format(timestamp);
  syncTime.textContent = fullDate.format(timestamp) === fullDate.format(now)
    ? shownTime : shortDate.format(timestamp) + ', ' + shownTime;
  syncSummary.title = 'Last successful sync · ' + fullDate.format(timestamp) + ', ' + shownTime + ' IST';
  syncSummary.hidden = false;
}

extensionApi.storage?.local.get(syncStorageKey)
  .then(result => showLastSync(result[syncStorageKey])).catch(() => {});
extensionApi.storage?.onChanged.addListener((changes, area) => {
  if (area === 'local') showLastSync(changes[syncStorageKey]?.newValue);
});

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
  const details = element('span', 'details');
  if (item.course) details.append(element('strong', 'assignment-course', item.course), ' · ');
  details.append('Due ', element('strong', 'assignment-due', due));
  content.append(element('span', 'title', item.title), details);
  link.append(date, content);
  row.append(link);
  return row;
}

function renderUpcoming(items, now = Date.now()) {
  const today = fullDate.format(now);
  const tomorrow = fullDate.format(now + 86_400_000);
  const groups = { Today: [], Tomorrow: [], Later: [] };
  for (const item of items) {
    const date = fullDate.format(displayDeadline(item));
    const group = date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : 'Later';
    groups[group].push(item);
  }
  list.replaceChildren(...Object.entries(groups).flatMap(([label, assignments]) => {
    if (!assignments.length) return [];
    const section = element('section', 'deadline-group');
    const heading = element('h2', 'deadline-group-title', label);
    heading.id = 'deadlines-' + label.toLowerCase();
    section.setAttribute('aria-labelledby', heading.id);
    const rows = element('ol', 'deadline-rows');
    rows.append(...assignments.map(renderItem));
    section.append(heading, rows);
    return [section];
  }));
  list.hidden = items.length === 0;
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
  if (item.due !== null) {
    const due = element('span', 'past-date', 'Due ');
    due.append(element('strong', '', fullDate.format(displayDeadline(item))));
    metadata.append(due);
  }
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
  load(false, past ? 1 : -1);
}

function showResult(result, showPast, slide = 0) {
  if (result && result === visibleResult) return;
  visibleResult = result;
  status.removeAttribute('data-empty');
  status.removeAttribute('title');
  status.removeAttribute('data-compact');
  list.hidden = true;
  historyList.hidden = true;
  emptyUpcoming.hidden = true;
  if (!result) {
    list.replaceChildren();
    historyList.replaceChildren();
    return;
  }
  const count = result.items.length;
  if (!count && !result.failed) {
    if (result.loaded > 0 && !showPast) emptyUpcoming.hidden = false;
    else status.setAttribute('data-empty', '');
  }
  const kind = showPast ? 'past' : 'upcoming';
  const summary = count ? count + ' ' + kind + (count === 1 ? ' assignment' : ' assignments') : 'No ' + kind + ' assignments';
  status.textContent = count ? count + ' ' + kind : summary;
  status.title = summary + ' · ' + result.loaded + (result.loaded === 1 ? ' course checked' : ' courses checked');
  status.setAttribute('data-compact', '');
  if (showPast) renderHistory(result.items);
  else renderUpcoming(result.items);
  if (slide && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const content = !emptyUpcoming.hidden ? emptyUpcoming : !count ? status : showPast ? historyList : list;
    content.animate?.([
      { transform: 'translateX(' + slide * 22 + 'px)', opacity: .35 },
      { transform: 'translateX(0)', opacity: 1 }
    ], { duration: 240, easing: 'cubic-bezier(.2,.75,.25,1)' });
  }
}

function showRefreshIssue(message, emptyStatus) {
  if (!visibleResult && emptyStatus) status.textContent = emptyStatus;
  refreshNotice.textContent = message;
  refreshNotice.hidden = false;
}

function showAccountName(name) {
  signedInAccount.hidden = !name;
  accountNameLabel.textContent = name || '';
  signedInAccount.title = name ? 'Signed in as ' + name : '';
}

async function load(force = false, slide = 0) {
  const version = ++loadVersion;
  const showPast = past;
  const loading = showPast ? 'Loading past assignments…' : 'Syncing assignments across your courses…';
  refresh.setAttribute('aria-busy', 'true');
  refresh.disabled = true;
  refreshNotice.hidden = true;
  showResult(loadedViews.get(showPast), showPast, slide);
  if (!visibleResult) status.textContent = loading;
  try {
    const tabs = await extensionApi.tabs.query({ url: campusUrl + '*', currentWindow: true });
    if (version !== loadVersion) return;
    const tab = tabs.find(candidate => candidate.active) ??
      tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
    if (tabId !== tab?.id) {
      tabId = tab?.id;
      accountScope = undefined;
      showAccountName();
      loadedViews.clear();
      openSubject = undefined;
      showResult(undefined, showPast);
      status.textContent = loading;
    }
    if (!tab) {
      status.textContent = 'Open DigiiCampus and sign in to sync your courses.';
      return;
    }

    let result;
    try {
      result = await extensionApi.tabs.sendMessage(tabId, { type: 'read-deadlines', refresh: force, past: showPast });
    } catch {
      if (version === loadVersion) showRefreshIssue('Refresh failed. Try again.', 'Reload your DigiiCampus tab to start syncing.');
      return;
    }
    if (version !== loadVersion) return;
    if (result?.state === 'sign-in' || (result?.accountScope && accountScope !== result.accountScope)) {
      accountScope = result.accountScope;
      loadedViews.clear();
      openSubject = undefined;
      showResult(undefined, showPast);
    }
    if (result?.state === 'sign-in' || result?.accountScope) showAccountName(result.accountName);
    if (result?.state === 'sign-in') {
      status.textContent = 'Sign in to DigiiCampus, then reopen the dashboard.';
      return;
    }
    if (result?.state !== 'ready' || !Array.isArray(result.items)) {
      showRefreshIssue('Refresh failed. Try again.', 'Couldn’t load your course list.');
      return;
    }
    if (result.failed) {
      if (!visibleResult && (result.loaded || result.items.length)) {
        loadedViews.set(showPast, result);
        showResult(result, showPast, slide);
      }
      const unavailable = result.failed + (result.failed === 1 ? ' course unavailable' : ' courses unavailable');
      showRefreshIssue(unavailable + '. Try again.', 'Couldn’t load assignments for your courses.');
      return;
    }
    showLastSync(result.syncedAt);
    loadedViews.set(showPast, result);
    showResult(result, showPast, slide);
  } catch {
    if (version === loadVersion) showRefreshIssue('Refresh failed. Try again.', 'Couldn’t read the dashboard.');
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
refresh.addEventListener('click', () => {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    refreshIcon?.animate?.([
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(360deg)' }
    ], { duration: 550, easing: 'cubic-bezier(.22,.7,.28,1)' });
  }
  return load(true);
});
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

