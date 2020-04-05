// background.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2015, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt
//
// ---
// Portions of this file are adapted from work that belongs to
// the Chromium Authors
//
// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

//
// Background (event) page of the extension
//
// * Keep track of which is the active tab
// * Via messages from the content script record if pages have feeds
// * Manage the icon of the extension
// * Display an orange dot if current tab contains a feed
// * If icon clicked, create the extension tab
// * If icon clicked and current tab has a feed, send it via a message to extension
// * Use localStorage to survive unloading of the event (background) page


// Local storage is needed on Google Chrome where the background page
// is event driven and its data is removed from memory after a small
// period of inactivity.
//
// Firefox doesn't support non-persistent background page, local
// storage is redundant but is compatible with Google Chrome
function resetLocalStorage()
{
  var tabs =
  {
    qfeedsTab: null,  // Integer ID of tab into which QFeeds is running
    lastActiveTab: 0
  };
  localStorage.setItem('tabs', JSON.stringify(tabs));

  // A dictionary keyed off of tabId that keeps track of data per tab (for
  // example what feedUrl was detected in the tab).
  var feedData = {}
  localStorage.setItem('feedData', JSON.stringify(feedData));
}

(function ()
{

console.log('On browser loaded, resetLocalStorage()');
resetLocalStorage();

// Get tabs record safely
// (handle wiped storage)
function getTabsRec()
{
  var tabs = JSON.parse(localStorage.getItem('tabs'));
  if (tabs == null)
  {
    // Local storage wiped via browser's Extension UI
    console.log('Resetting local storage records');
    resetLocalStorage();
    tabs = JSON.parse(localStorage.getItem('tabs'));
  }
  return tabs;
}

// A tab was closed
chrome.tabs.onRemoved.addListener(function(tabId)
    {
      // console.log('remove ' + tabId)
      getTabsRec();  // Handle any storage reset
      var feedData = JSON.parse(localStorage.getItem('feedData'));
      delete feedData[tabId];
      localStorage.setItem('feedData', JSON.stringify(feedData));
    });

// Activate extension tab
// tabId -- id of current (or most recent) tab
function activateQFeeds(tabId)
{
  var tabs = getTabsRec();
  if (tabs.qfeedsTab == null)
  {
    // Create a new tab
    chrome.tabs.create({ url: '../qfeeds/app.html'}, function (newTab)
        {
          tabs.qfeedsTab = newTab.id;
          console.log('QFeeds started at tab ' + tabs.qfeedsTab);
          localStorage.setItem('tabs', JSON.stringify(tabs));
        });
  }
  else
  {
    // Activate existing tab where the extension is already running
    console.log('Existing tab ' + tabs.qfeedsTab);
    // Chrome deprecated: chrome.tabs.update(tabs.qfeedsTab, {selected: true});
    chrome.tabs.update(tabs.qfeedsTab, {active: true});
    console.log('QFeeds activated as tab ' + tabs.qfeedsTab);

    // Send it feed info (if any for last active tab)
    console.log('QFeeds extension\'s main notified for feeds of last active tab (' + tabs.lastActiveTab + ')');
    var feedData = JSON.parse(localStorage.getItem('feedData'));
    chrome.runtime.sendMessage({msg: 'feedsActivated', feedData: feedData[tabs.lastActiveTab]});
  }
}

// Handle click on the icon of the extension
// Start the extension or activate an existing tab into which it is running
chrome.browserAction.onClicked.addListener(function(tab)
    {
      activateQFeeds(tab);
    });

// Monitor if the extension's tab has been closed
chrome.tabs.onRemoved.addListener(function (removedTab, removeInfo)
    {
      var tabs = getTabsRec();
      if (tabs.qfeedsTab == removedTab)
      {
        console.log('QFeeds closed as tab ' + tabs.qfeedsTab);
        tabs.qfeedsTab = null;
        localStorage.setItem('tabs', JSON.stringify(tabs));
      }
    });

// Checks if an URL is extension's URL
function isSelfURL(url)
{
  if (url == 'chrome-extension://kdjijdhlleambcpendblfhdmpmfdbcbd/qfeeds/app.html')
    return true;
  if (url == 'moz-extension://d9585aca-b726-4305-b925-743007851f14/qfeeds/app.html')
    return true;
  return false;
}

// Record any new tab as lastActiveTab
chrome.tabs.onActivated.addListener(function(activeInfo, selectInfo)
    {
      var tabId = activeInfo.tabId;
      var tabs = getTabsRec();
      if (tabs.qfeedsTab != tabId)
      {
        console.log('selected (active): ' + tabs.lastActiveTab);
        tabs.lastActiveTab = tabId;
        localStorage.setItem('tabs', JSON.stringify(tabs));
      }
      else
      {
        console.log('selected: ' + tabId);
      }
    });

// 1. Monitor the URLs of all tabs in case the extension is activated
//    directly by the user pasting the URL (This is a *very* corner case)
// 2. Monitor if user leaves by entering an URL into the extension's tab
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab)
    {
      // console.log('tabs.onUpdated -- tab: ' + tabId + ' status ' + changeInfo.status);
      // console.log(tab.url);
      if (! (changeInfo.status == 'loading' || changeInfo.status == 'complete'))
        return;
      // Monitor if URL of a tab changes
      // 1. Away from QFeeds extension
      // 2. Into QFeeds extension
      var tabs = getTabsRec();
      if (tabId == tabs.qfeedsTab)
      {
        if (!isSelfURL(tab.url))
        {
          console.log('Extension exited by URL')
          tabs.qfeedsTab = null;
          localStorage.setItem('tabs', JSON.stringify(tabs));
        }
      }
      else
      {
        if (isSelfURL(tab.url))
        {
          console.log('Extension entered by way of URL')
          tabs.qfeedsTab = tabId;
          localStorage.setItem('tabs', JSON.stringify(tabs));
        }
      }
    });

// Checks if source is "http" or "https"
function isValidFeedSource(href)
{
  var a = document.createElement('a');
  a.href = href;
  if (a.protocol == "http:" || a.protocol == "https:")
    return true;
  else
  {
    console.log('Warning: feed source rejected (wrong protocol): ' + href);
    return false;
  }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse)
{
  getTabsRec();  // Handle any storage reset

  if (request.msg == "feedIcon")  // The page contains a link to a feed or feeds
  {
    // First validate that all the URLs have the right schema.
    var input = [];
    for (var i = 0; i < request.feeds.length; ++i)
    {
      if (isValidFeedSource(request.feeds[i].href))
        input.push(request.feeds[i]);
    }

    if (input.length == 0)
      return;  // We've rejected all the input, so abort.

    // We have received a list of feed urls found on the page.
    // Enable the page action icon.
    var feedData = JSON.parse(localStorage.getItem('feedData'));
    feedData[sender.tab.id] = input;
    localStorage.setItem('feedData', JSON.stringify(feedData));
    console.log('background_js: set feedIcon for tab ' + sender.tab.id)
    console.log(input)
    chrome.browserAction.setIcon({
          tabId: sender.tab.id,
          path: 'qfeeds/images/icon_rss_present.svg'
        });
  }
  else if (request.msg == "feedDocument")  // The entire page is a feed XML
  {
    console.log('feedDocument: ' + request.href);

    // Validate input, store inside feedData[]
    var input = [];
    if (isValidFeedSource(request.href))
      input.push({'href': request.href});
    else
      return;
    var feedData = JSON.parse(localStorage.getItem('feedData'));
    feedData[sender.tab.id] = input;
    localStorage.setItem('feedData', JSON.stringify(feedData));

    // Mark the sender tab as last active
    var tabs = getTabsRec();
    console.log('selected (force-active): ' + sender.tab.id);
    tabs.lastActiveTab = sender.tab.id;
    localStorage.setItem('tabs', JSON.stringify(tabs));

    // We received word from the content script that this document
    // is an RSS feed (not just a document linking to the feed).
    // So, we go straight to the subscribe page in a new tab and
    // navigate back on the current page (to get out of the xml page).
    // We don't want to navigate in-place because trying to go back
    // from the subscribe page takes us back to the xml page, which
    // will redirect to the subscribe page again (we don't support a
    // location.replace equivalant in the Tab navigation system).
    chrome.tabs.executeScript(sender.tab.id,
        {
          code: "if (history.length > 1) " +
                "history.go(-1); else window.close();"
        });
    activateQFeeds(sender.tab.id);
  }
  else if (request.msg == 'getFeedsList')
  {
    var tabs = getTabsRec();
    var feedData = JSON.parse(localStorage.getItem('feedData'));
    console.log('QFeeds extension\'s main page asked for feeds of last active tab (' + tabs.lastActiveTab + ')');
    sendResponse({feedData: feedData[tabs.lastActiveTab]});
  }
});

})();
