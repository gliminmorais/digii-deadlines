const extension = typeof browser === 'undefined' ? chrome : browser;
const dashboardUrl = extension.runtime.getURL('sidepanel.html') + '?view=tab';

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
