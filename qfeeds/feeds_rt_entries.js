// feeds_rt_subs.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2021, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Handle events for a remote table of RSS subscriptions
//

// Declare empty namespace if not yet defined
if (typeof feeds_rt_entries_ns === 'undefined')
  feeds_rt_entries_ns = {};

(function ()
{
"use strict";

// object rtHandlerEntries [constructor]
// Instantiate one per application
function rtHandlerEntries(feeds, rtName)
{
  let self = this;

  self.m_feeds = feeds;
  self.m_rtName = rtName;

  // Help strict mode detect miss-typed fields
  Object.preventExtensions(this);

  return this;
}

// object RemoteEntryRead [constructor]
// From an RssEntry constructs a RemoteEntryRead record,
// it is one row in the remote table, the firt entry is the table key
function RemoteEntryRead(rssEntry)
{
  let rss_entry_hash = null;
  let rss_feed_hash = null;
  let is_read = false;
  let entry_date = null;
  if (rssEntry == null)  // An empty object was requested?
    return [rss_entry_hash, rss_feed_hash, is_read, entry_date]

  rss_entry_hash = rssEntry.m_hash;

  let h = rssEntry.m_rssurl_date.indexOf('_');
  utils_ns.assert(h >= 0, "RemoteEntryRead: invalid rssurl_date hash");
  rss_feed_hash = rssEntry.m_rssurl_date.slice(0, h);

  is_read = rssEntry.m_is_read;
  entry_date = utils_ns.dateToStrStrict(rssEntry.m_date);
  // Strip the time (after '_')
  // Date is sufficient for keeping the age of an entry
  // Date is used only for the purpose of making an entry expire and be deleted
  let limit = entry_date.indexOf('_');
  entry_date = entry_date.slice(0, limit);
  return [rss_entry_hash, rss_feed_hash, is_read, entry_date]
}

// object rtHandlerEntries.fullTableWrite
// (Full Write) Walk over all RSS entries in the local DB and send all that were marked as read
// to remote table
//
// Params:
// rt -- Remote Tables Object
function fullTableWrite(rt, cbDone)
{
  let self = this;
  let all = [];

  self.m_feeds.updateEntriesAll(
      function(rssEntry)
      {
        if (rssEntry == null)  // No more entries
        {
          rt.writeFullState('rss_entries_read', all, function(exitCode)
              {
                if (cbDone != null)
                  cbDone(exitCode);
              });
          return 0;
        }

        // One row in the remote table
        let newRemoteEntry = new RemoteEntryRead(rssEntry);
        // Collect it
        all.push(newRemoteEntry);

        // No changes to the entry, move to the next
        return 2;
      });
}
rtHandlerEntries.prototype.fullTableWrite = fullTableWrite;

// export to feeds_rt_entries_ns namespace
feeds_rt_entries_ns.rtHandlerEntries = rtHandlerEntries;
})();
