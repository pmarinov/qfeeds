// feeds_rt_subs.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2021, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Handle events for a remote table of RSS subscriptions
//

// Declare empty namespace if not yet defined
if (typeof feeds_rt_subs_ns === 'undefined')
  feeds_rt_subs_ns = {};

(function ()
{
"use strict";

// object rtHandlerSubs [constructor]
// Instantiate one per application
function rtHandlerSubs(feeds, rtName)
{
  let self = this;

  self.m_feeds = feeds;
  self.m_rtName = rtName;

  // Help strict mode detect miss-typed fields
  Object.preventExtensions(this);

  return this;
}

// object RemoteFeedUrl [constructor]
// From an RssHeader constructs a RemoteFeedUrl record
function RemoteFeedUrl(feed)
{
  if (feed == null)  // An empty object was requested?
    return [null, null, null]

  // url, tags, user-set options for the feed
  return [feed.m_url, feed.m_tags, ""];
}

// object rtHandlerSubs.fullTableWrite
// (Full Write) Walk over all RSS subscription records in the local DB and send all of then
// to remote table
//
// Params:
// rt -- Remote Tables Object
function fullTableWrite(rt, cbDone)
{
  let self = this;
  let all = [];

  self.m_feeds.p_feedsUpdateAll(
      function(feed)
      {
        // Parameter: 'feed' one subsription descriptor -- one by one
        // this function is called for all entries in the table
        // indexed db 'rss_subscription'

        if (feed == null)  // No more entries
        {
          // Write to remote table all the entries that were collected
          // in local variable all[]
          rt.writeFullState(self.m_rtName, all, function(exitCode)
              {
                // Chain into cbDone()
                if (cbDone != null)
                  cbDone(exitCode);
              });
          return 0;
        }

        // One row in the remote table
        let newRemoteEntry = new RemoteFeedUrl(feed);
        // Collect it
        all.push(newRemoteEntry);

        // No changes to the entry, move to the next
        return 2;
      });
}
rtHandlerSubs.prototype.fullTableWrite = fullTableWrite;

// object rtHandlerSubs.handleEntryEvent
// Handle updates from the remote tables for 'rss_subscriptions'
// (Entries added/set or deleted)
function handleEntryEvent(records)
{
  let self = this;

  let k = 0;
  let r = null;
  for (k = 0; k < records.length; ++k)
  {
    (function()  // scope
    {
      // Unfold one record -- each simply an array of 2 entries
      r = records[k];
      let feedUrl = r.data[0];
      let feedTags = r.data[1];

      let sha1 = CryptoJS.SHA1(feedUrl);
      let feedHash = sha1.toString();
      let x = self.m_feeds.p_feedFindByHash(feedHash);

      // Skip operation if it is remote delete
      // Local delete will take place when scheduled
      if (r.isDeleted)  // remotely deleted?
      {
        if (x == -1)
        {
          log.warn('rtHandlerSubs.handleEntryEvent: unknown feed ' + feedHash);
          return;
        }
        log.info('rtHandlerSubs.handleEntryEvent: deleted remotely -- ' + self.m_feeds.m_rssFeeds[x].m_url);
        self.m_feeds.p_feedRemove(self.m_feeds.m_rssFeeds[x].m_url, false);
        self.m_feeds.m_feedsCB.onRemoteFeedDeleted(feedHash);
        return;  // leave the anonymous scope
      }

      // A record was added or updated
      let newFeed = null;
      if (x == -1)   // Update or addition of a new feed from a remote operation
      {
        newFeed = feeds_ns.emptyRssHeader();
      }
      else
      {
        // We already have such feed locally: this is an update operation
        newFeed = feeds_ns.copyRssHeader(self.m_feeds.m_rssFeeds[x]);
      }
      // Now apply the data that come from the remote operation
      newFeed.m_hash = feedHash;
      newFeed.m_url = feedUrl;
      newFeed.m_tags = feedTags;
      newFeed.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;

      // Put into local list of RSS subscriptions (self.m_feeds.m_rssFeeds)
      self.m_feeds.p_feedInsert(newFeed);

      // Put in the IndexedDB
      self.m_feeds.p_feedRecord(newFeed, false,
          function(wasUpdated)
          {
            if (wasUpdated == 1)
            {
              // New feed -> fetch RSS data
              self.m_feeds.p_fetchRss(newFeed.m_url, null,
                  function()  // CB: write operation is completed
                  {
                    // If any extra activation/display is needed
                    self.m_feeds.m_feedsCB.onRemoteFeedUpdated(newFeed.m_url, newFeed.m_tags);
                  });
            }
            else
              log.info('rtHandlerSubs.handleEntryEvent: nothing to do for ' + newFeed.m_url);
          });
    })()
  }
}
rtHandlerSubs.prototype.handleEntryEvent = handleEntryEvent;

// object rtHandlerSubs.fullTableSync
// (Full Sync) Apply a full remote state locally
// 1. Add all remote entries that are NOT present locally
// 2. Delete all local entries that are NOT in the remote table
//
// Params:
// rt -- Remote Tables Object (Dropbox connector)
// table -- Entire remote table (all entries)
function fullTableSync(rt, table, cbDone)
{
  let self = this;

  // Make a hash map of the local entries, mark them entries as 0
  let k = 0;
  let entry = null;
  let localEntries = {};
  for (k = 0; k < self.m_feeds.m_rssFeeds.length; ++k)
  {
    entry = self.m_feeds.m_rssFeeds[k];
    localEntries[entry.m_url] = 0;
  }

  // Generate event _updated_ for all remote entries
  let x = 0;
  let rtEntry = null;
  let key = null;
  let objList = [];
  let updateObj = null;
  for (x = 0; x < table.length; ++x)
  {
    rtEntry = table[x];
    // Imitate generation of an updated obj
    updateObj =
      {
        isDeleted: false,  // Operation is insert/update, not delete
        data: rtEntry.slice(0)  // Clone the array
      };
    objList.push(updateObj);

    key = rtEntry[0];  // URL of the feed
    localEntries[key] = 1;
  }

  // Update/insert all remote entries
  self.handleEntryEvent(objList);

  // Generate event _deleted_ for all that were in local but
  // not in the remote table
  let keys = Object.keys(localEntries);
  let index = 0;
  objList = [];
  for (x = 0; x < keys.length; ++x)
  {
    key = keys[x];  // key an URL of subscribed feed
    if (localEntries[key] == 1)  // RSS subscription is in local AND in remote
      continue;

    // Verify if the local entry has been sent to remote table
    index = self.m_feeds.p_feedFindByUrl(key);
    utils_ns.assert(index >= 0,
        "rtHandlerSubs.fullTableSync: Unexpected result from p_feedFindByUrl()");
    entry = self.m_feeds.m_rssFeeds[index];
    if (entry.m_remote_state != feeds_ns.RssSyncState.IS_SYNCED)
      continue;  // Skip deleting

    // Imitate generation of an updated obj
    // local[key] is in local, but no longer in the remote, it needs to be deleted
    updateObj =
      {
        isDeleted: true,  // Operation is insert/update, not delete
        data: null
      };
    objList.push(updateObj);
  }

  // Delete locally all entries that were selected
  self.handleEntryEvent(objList);

  if (cbDone)
    cbDone();
}
rtHandlerSubs.prototype.fullTableSync = fullTableSync;

// export to feeds_rt_subs_ns namespace
feeds_rt_subs_ns.rtHandlerSubs = rtHandlerSubs;
})();
