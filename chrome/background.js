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

(function ()
{

var rrssTab = null;  // Integer ID of tab into which "rrss" is running

// A dictionary keyed off of tabId that keeps track of data per tab (for
// example what feedUrl was detected in the tab).
var feedData = {};
var lastActiveTab = 0;  // TODO: track last active tab properly

// Handle click on the icon of the extension
// Start the extension or activate an existing tab into which it is running
chrome.browserAction.onClicked.addListener(function(tab)
    {
      if (rrssTab == null)
      {
        // Create a new tab
        chrome.tabs.create({ url: '../rrss/app.html'}, function (newTab)
            {
              rrssTab = newTab.id;
              console.log('"rrss" opened at tab ' + rrssTab);
            });
      }
      else
      {
        // Activate existing tab where the extension is already running
        chrome.tabs.update(rrssTab, {selected: true});
        console.log('"rrss" activated as tab ' + rrssTab);

        chrome.runtime.sendMessage({msg: 'feedsActivated', feedData: feedData[lastActiveTab]});
      }
    });

// Monitor if the extension's tab has been closed
chrome.tabs.onRemoved.addListener(function (removedTab, removeInfo)
    {
      if (rrssTab == removedTab)
      {
        console.log('"rrss" closed as tab ' + rrssTab);
        rrssTab = null;
      }
    });

// Checks if an URL is extension's URL
function isSelfURL(url)
{
  if (url == 'chrome-extension://kdjijdhlleambcpendblfhdmpmfdbcbd/rrss/app.html')
    return true;
  else
    return false;
}

chrome.tabs.onSelectionChanged.addListener(function(tabId, selectInfo)
    {
      console.log('selected: ' + tabId);
      lastActiveTab = tabId;
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
      // 1. Away from "rrss" extension
      // 2. Into "rrss" extension
      if (tabId == rrssTab)
      {
        if (!isSelfURL(tab.url))
        {
          console.log('Extension exited by URL')
          rrssTab = null;
        }
      }
      else
      {
        if (isSelfURL(tab.url))
        {
          console.log('Extension entered by URL')
          rrssTab = tabId;
        }
      }
    });

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.msg == "feedIcon") {
    // First validate that all the URLs have the right schema.
    var input = [];
    for (var i = 0; i < request.feeds.length; ++i) {
      var a = document.createElement('a');
      a.href = request.feeds[i].href;
      if (a.protocol == "http:" || a.protocol == "https:") {
        input.push(request.feeds[i]);
      } else {
        console.log('Warning: feed source rejected (wrong protocol): ' +
                    request.feeds[i].href);
      }
    }

    if (input.length == 0)
      return;  // We've rejected all the input, so abort.

    // We have received a list of feed urls found on the page.
    // Enable the page action icon.
    feedData[sender.tab.id] = input;
    lastActiveTab = sender.tab.id;  // TODO: fix this, it is just a cheap test here
    console.log("background_js: feedIcon")
    console.log(input)
    // chrome.pageAction.setTitle(
    //   { tabId: sender.tab.id,
    //     title: chrome.i18n.getMessage("rss_subscription_action_title")
    //   });
    // chrome.pageAction.show(sender.tab.id);
  } else if (request.msg == "feedDocument") {
    // We received word from the content script that this document
    // is an RSS feed (not just a document linking to the feed).
    // So, we go straight to the subscribe page in a new tab and
    // navigate back on the current page (to get out of the xml page).
    // We don't want to navigate in-place because trying to go back
    // from the subscribe page takes us back to the xml page, which
    // will redirect to the subscribe page again (we don't support a
    // location.replace equivalant in the Tab navigation system).
    chrome.tabs.executeScript(sender.tab.id,
        { code: "if (history.length > 1) " +
                 "history.go(-1); else window.close();"
        });
    var url = "subscribe.html?" + encodeURIComponent(request.href);
    url = chrome.extension.getURL(url);
    console.log('background_js: feedDocument' + url)
    //chrome.tabs.create({ url: url, index: sender.tab.index });
  } else if (request.msg == 'getFeedsList')
  {
    console.log('"rrss" extension asked for feeds of last active tab')
    sendResponse({feedData: feedData[lastActiveTab]})
  }
});

chrome.tabs.onRemoved.addListener(function(tabId)
{
  // console.log('remove ' + tabId)
  delete feedData[tabId];
});

chrome.runtime.onInstalled.addListener(function() {
  console.log('installed');
});

chrome.runtime.onSuspend.addListener(function() {
  // Do some simple clean-up tasks.
  console.log('closed');
});

})();
