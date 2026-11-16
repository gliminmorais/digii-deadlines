const campusUrl = 'https://snuc.digiicampus.com/';
const status = document.querySelector('#status');
const list = document.querySelector('#deadlines');
const refresh = document.querySelector('#refresh');
const campus = document.querySelector('#campus');
const timeZone = 'Asia/Kolkata';
const month = new Intl.DateTimeFormat('en-IN', { timeZone, month: 'short' });
const day = new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric' });
const fullDate = new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium' });
const time = new Intl.DateTimeFormat('en-IN', { timeZone, timeStyle: 'short' });
let tabId;

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

async function load(force = false) {
  if (refresh.getAttribute('aria-busy') === 'true') return;
  refresh.setAttribute('aria-busy', 'true');
  try {
    const tabs = await chrome.tabs.query({ url: campusUrl + '*', currentWindow: true });
    const tab = tabs.find(candidate => candidate.active) ??
      tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
    tabId = tab?.id;
    list.replaceChildren();
    list.hidden = true;
    if (!tab) {
      status.textContent = 'Open DigiiCampus and sign in to sync your courses.';
      return;
    }

    let result;
    status.textContent = 'Syncing assignments across your courses…';
    try {
      result = await chrome.tabs.sendMessage(tabId, { type: 'read-deadlines', refresh: force });
    } catch {
      status.textContent = 'Reload your DigiiCampus tab to start syncing.';
      return;
    }
    if (result?.state === 'sign-in') {
      status.textContent = 'Sign in to DigiiCampus, then reopen the dashboard.';
      return;
    }
    if (result?.state !== 'ready') {
      status.textContent = 'Couldn’t load your course list. Check your DigiiCampus session and try Refresh.';
      return;
    }
    const count = result.items.length;
    const summary = count ? count + (count === 1 ? ' upcoming assignment' : ' upcoming assignments') : 'No upcoming assignments';
    const coverage = result.failed
      ? ' · ' + result.failed + (result.failed === 1 ? ' course unavailable' : ' courses unavailable')
      : ' · ' + result.loaded + (result.loaded === 1 ? ' course checked' : ' courses checked');
    status.textContent = result.failed && !result.loaded && !count
      ? 'Couldn’t load assignments for your courses. Try Refresh.'
      : summary + coverage;
    list.replaceChildren(...result.items.map(renderItem));
    list.hidden = count === 0;
  } catch {
    status.textContent = 'Couldn’t read the dashboard. Try refreshing.';
  } finally {
    refresh.removeAttribute('aria-busy');
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
load();

