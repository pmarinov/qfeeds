// background.js

if (false)
{
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    console.log("Updated: " + tabId + " " + changeInfo.url + " " + tab.url);
  });
}
