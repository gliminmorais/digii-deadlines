# Digii Deadlines for Chrome

Digii Deadlines shows upcoming assignments across your SNUC DigiiCampus courses in one Chrome popup.

## Install in Chrome

### 1. Download and extract the extension

On this repository page, select **Code → Download ZIP**. On Windows, right-click the downloaded ZIP, select **Extract All**, and open the extracted folder. Look for the folder containing `manifest.json`.

### 2. Turn on Developer mode

In Chrome, open the **⋮** menu in the top-right corner and choose **Extensions → Manage extensions**. You can also type `chrome://extensions` in the address bar and press **Enter**.

<img src="docs/screenshots/manage-extensions.png" alt="Chrome menu with Extensions → Manage extensions open" width="420">

On the Extensions page, turn on **Developer mode** in the top-right corner. The **Load unpacked** button appears near the top left. Local installation is free.

![Chrome Extensions page with the Developer mode switch in the top-right corner and the Load unpacked button in the toolbar](docs/screenshots/developer-mode.png)

### 3. Load Digii Deadlines

Click **Load unpacked** near the top left. In the folder picker, select the extracted folder containing `manifest.json` and click **Select Folder**. Check that the **Digii Deadlines** card appears on the Extensions page and its switch is on.

### 4. Open the dashboard

Open or refresh [SNUC DigiiCampus](https://snuc.digiicampus.com/) and sign in. In Chrome, click the **Extensions** puzzle-piece icon and choose **Digii Deadlines**. Click the pin next to it if you want quick access from the toolbar.

![Chrome Extensions menu showing the pin control next to an extension](https://developer.chrome.com/static/docs/extensions/get-started/tutorial/hello-world/image/pinning-extension-215cb97773ab6.png)

The pinning screenshot shows an example extension. [Chrome’s local installation guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)

## How it works

The extension starts syncing when you open DigiiCampus while signed in. It reads your enrolled courses and upcoming assignments automatically. The dashboard shows unsubmitted assignments in due-date order and links to each assignment. Times are shown in IST. **Refresh** checks DigiiCampus again. If some courses are unavailable, the dashboard reports how many.

The extension uses read-only requests to SNUC DigiiCampus with your existing browser session. It keeps the dashboard data in tab memory and uses no external services.

To upgrade from an earlier version, extract this ZIP over the folder you originally loaded, click **Reload** on the Digii Deadlines card at `chrome://extensions`, and reload DigiiCampus. If you extract to a different folder, remove the old extension and load the new folder.

The sync was exercised with simulated DigiiCampus data. Live behavior in an authenticated SNUC account still needs verification. The [public Digii API research](https://github.com/Sheikh162/digii-campus-mcp/blob/main/CENSUS.md) documents the endpoints used here.

