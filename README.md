# Digii Deadlines for Chrome

1. On GitHub, select **Code → Download ZIP**, then extract it. Keep the extracted folder somewhere you can find it later.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
4. Reload your [SNUC DigiiCampus](https://snuc.digiicampus.com/) tab and sign in as usual.
5. Open **Digii Deadlines** from Chrome's Extensions menu. Pin it to keep it on the toolbar.

The extension starts syncing when you open DigiiCampus while signed in. It reads your enrolled courses and upcoming assignments automatically. The dashboard shows unsubmitted assignments in due-date order and links to each assignment. Times are shown in IST. **Refresh** checks DigiiCampus again. If some courses are unavailable, the dashboard reports how many.

The extension uses read-only requests to SNUC DigiiCampus with your existing browser session. It keeps the dashboard data in tab memory and uses no external services.

To upgrade from an earlier version, extract this ZIP over the folder you originally loaded, click **Reload** on the Digii Deadlines card at `chrome://extensions`, and reload DigiiCampus. If you extract to a different folder, remove the old extension and load the new folder.

The sync was exercised with simulated DigiiCampus data. Live behavior in an authenticated SNUC account still needs verification. The [public Digii API research](https://github.com/Sheikh162/digii-campus-mcp/blob/main/CENSUS.md) documents the endpoints used here.

