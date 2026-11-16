const campusUrl = 'https://snuc.digiicampus.com/';
const status = document.querySelector('#status');
const list = document.querySelector('#deadlines');
const historyList = document.querySelector('#history');
const upcomingView = document.querySelector('#upcoming-view');
const pastView = document.querySelector('#past-view');
const refresh = document.querySelector('#refresh');
const campus = document.querySelector('#campus');
const timeZone = 'Asia/Kolkata';
const month = new Intl.DateTimeFormat('en-IN', { timeZone, month: 'short' });
const day = new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium' });
const time = new Intl.DateTimeFormat('en-IN', { timeZone, timeStyle: 'short' });
let tabId;
let loadVersion = 0;
let past = false;
const openSubjects = new Set();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderItem(item) {
  const row = element('li');
  const link = element('a', 'assignment');
  link.href = item.href;
  link.target = '_blank';
  link.rel = 'noopener';
  const date = element('span', 'date');
  date.setAttribute('aria-hidden', 'true');
  date.append(element('span', 'day', day.format(item.due)), element('span', '', month.format(item.due)));
  const content = element('span');
  const due = item.dateOnly ? fullDate.format(item.due) : fullDate.format(item.due) + ', ' + time.format(item.due);
  content.append(
    element('span', 'title', item.title),
    element('span', 'details', [item.course, 'Due ' + due].filter(Boolean).join(' · '))
  );
  link.append(date, content);
  row.append(link);
  return row;
}

function historyItem(item) {
  const row = element('li', 'history-item');
  const link = element('a', 'title', item.title);
  link.href = item.href;
  link.target = '_blank';
  link.rel = 'noopener';
  const metadata = element('div', 'history-meta');
  const label = item.submitted === true ? 'Submitted' : item.submitted === false ? 'Not submitted' : 'Status unavailable';
  const state = item.submitted === true ? 'submitted' : item.submitted === false ? 'missing' : 'unknown';
  metadata.append(element('span', 'submission ' + state, label));
  if (item.grade) {
    const score = item.maximum && /^\d+(?:\.\d+)?$/.test(item.grade)
      ? item.grade + ' / ' + item.maximum : item.grade;
    metadata.append(element('span', 'marks', 'Marks ' + score));
  }
  if (item.due !== null) metadata.append(element('span', 'past-date', 'Due ' + fullDate.format(item.due)));
  row.append(link, metadata);
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
    group.open = openSubjects.has(id);
    const header = element('summary', 'subject-heading');
    header.append(element('span', 'subject-name', name(rows)),
      element('span', 'subject-count', rows.length + (rows.length === 1 ? ' assignment' : ' assignments')));
    const assignments = element('ul', 'history-items');
    assignments.append(...rows.map(historyItem));
    group.append(header, assignments);
    group.addEventListener('toggle', () => {
      if (group.open) openSubjects.add(id);
      else openSubjects.delete(id);
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
  list.hidden = true;
  historyList.hidden = true;
  load();
}

async function load(force = false) {
  const version = ++loadVersion;
  refresh.setAttribute('aria-busy', 'true');
  refresh.disabled = true;
  try {
    const tabs = await chrome.tabs.query({ url: campusUrl + '*', currentWindow: true });
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
      result = await chrome.tabs.sendMessage(tabId, { type: 'read-deadlines', refresh: force, past });
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
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    await chrome.tabs.create({ url: campusUrl });
  }
});
refresh.addEventListener('click', () => load(true));
upcomingView.addEventListener('click', () => selectView(false));
pastView.addEventListener('click', () => selectView(true));
chrome.tabs.onActivated.addListener(() => load());
chrome.tabs.onRemoved.addListener(closedId => {
  if (closedId === tabId) load();
});
chrome.tabs.onUpdated.addListener((updatedId, change, tab) => {
  const isCampus = tab.url?.startsWith(campusUrl);
  if ((change.status === 'complete' && isCampus) || (updatedId === tabId && change.url && !isCampus)) load();
});
load();

