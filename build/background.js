const APP_PAGE_PATH = "public/index.html";

async function openOrFocusAppTab() {
  const appUrl = chrome.runtime.getURL(APP_PAGE_PATH);
  const existingTabs = await chrome.tabs.query({ url: appUrl });

  if (existingTabs.length > 0) {
    const firstTab = existingTabs[0];
    if (typeof firstTab.id === "number") {
      await chrome.tabs.update(firstTab.id, { active: true });
    }

    if (typeof firstTab.windowId === "number") {
      await chrome.windows.update(firstTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: appUrl });
}

chrome.action.onClicked.addListener(() => {
  openOrFocusAppTab().catch((error) => {
    console.error("Failed to open rss4u tab:", error);
  });
});
