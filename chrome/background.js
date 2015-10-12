// background.js

chrome.browserAction.onClicked.addListener(function(tab)
{
  chrome.tabs.create({ url: '../rrss/app.html'});
});

chrome.runtime.onInstalled.addListener(function() {
  console.log('installed');
});

chrome.runtime.onSuspend.addListener(function() { 
  // Do some simple clean-up tasks.
});

if (false)
{
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    console.log("Updated: " + tabId + " " + changeInfo.url + " " + tab.url);
  });
}
