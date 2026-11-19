const extension = typeof browser === 'undefined' ? chrome : browser;
const dashboardUrl = extension.runtime.getURL('sidepanel.html') + '?view=tab';
const syncStorageKey = 'lastSuccessfulDigiiSync';
let syncWrites = Promise.resolve();

extension.runtime.onMessage?.addListener((message, sender, reply) => {
  const time = message?.syncedAt;
  if (message?.type !== 'digii-full-sync' || !sender.url?.startsWith('https://snuc.digiicampus.com/') ||
      !Number.isSafeInteger(time) || time <= 0 || time > Date.now()) return;
  const write = syncWrites.then(async () => {
    const stored = await extension.storage.local.get(syncStorageKey);
    if (time > (stored[syncStorageKey] ?? 0)) await extension.storage.local.set({ [syncStorageKey]: time });
  });
  syncWrites = write.catch(() => {});
  write.then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});

function openDashboard() {
  return extension.tabs.create({ url: dashboardUrl });
}

function openFromToolbar() {
  const sidebar = extension.sidebarAction;
  const attempt = sidebar?.open ? sidebar.open().catch(openDashboard) : openDashboard();
  return attempt.catch(error => console.error('Could not open Digii Deadlines', error));
}

const panel = extension.sidePanel;
if (extension.runtime.getManifest().side_panel && panel?.setPanelBehavior) {
  extension.runtime.onInstalled.addListener(() => {
    panel.setPanelBehavior({ openPanelOnActionClick: true }).catch(error => {
      console.error('Could not enable the Digii Deadlines side panel', error);
    });
  });
} else {
  extension.action.onClicked.addListener(openFromToolbar);
}
