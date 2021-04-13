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

// object rtHandlerSubs.handleEntryEvent
// Handle updates from the remote tables for 'rss_subscriptions'
// (Entries added/set or deleted)
function handleEntryEvent(records, cbDone)
{
  let self = this;

  let numCompleted = 0;
  let requestCompleted = false;
  let k = 0;
  let r = null;
  for (k = 0; k < records.length; ++k)
  {
      let r = records[k];

      // Skip operation if it is remote delete
      // Local delete will take place when scheduled (entry is aged)
      if (r.isDeleted)  // remotely deleted?
        continue;

      let rss_entry_hash = r.data[0];
      let rss_feed_hash = r.data[1];
      let is_read = r.data[2];
      let strDate = r.data[3];

      // Reflect the new state on the screen (if the feed is currently displayed)
      self.m_feeds.m_feedsCB.onRemoteMarkAsRead(rss_entry_hash,
          rss_feed_hash, is_read);

      if (false)
      {
        // Deletion should be done when entries are expired in the local DB
        // TOOD: REMOVE from here

        // Check if the entry is too old and needs to be remove from the remote table (expired)
        var dateEntry = utils_ns.parseStrictDateStr(strDate);
        if (feeds_ns.isTooOldDate(dateEntry))
        {
          log.trace('Expire entry ' + strDate);
          rt.deleteRec(self.m_rtName, rss_entry_hash);
          self.p_incExpireCount();
        }
      }

      ++numCompleted;  // The number of expected completion callbacks

      // Apply new state in the IndexedDB
      self.m_feeds.feedUpdateEntry(rss_entry_hash,
          function(state, dbEntry)
          {
            --numCompleted;

            // Everything already recorded?
            if (requestCompleted && numCompleted == 0)
            {
              log.info(`rtHandlerSubs.handleEntryEvent: updated ${numCompleted} entries`);
              cbDone();
            }

            if (state == 0)
            {
              utils_ns.assert(dbEntry.m_hash == rss_entry_hash, 'markAsRead: bad data');

              if (dbEntry.m_is_read == is_read)  // Nothing changed?
              {
                log.trace("db: ('rss_data') update entry (" + rss_entry_hash + '): is_read = ' + is_read);
                return 1;  // Don't record in the DB
              }
              else
              {
                dbEntry.m_is_read = is_read;
                dbEntry.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;
                return 0;  // Record in the DB
              }
            }
            else if (state == 1)
            {
              log.trace("db: ('rss_data') update entry (" + rss_entry_hash + '): not found: put local placeholder');
              // Create a pseudo entry -- only hash, date, m_remote_state and is_read are valid
              dbEntry.m_hash = rss_entry_hash;
              dbEntry.m_date = dateEntry;  // in Date object format
              dbEntry.m_remote_state = feeds_ns.RssSyncState.IS_REMOTE_ONLY;
              dbEntry.m_is_read = is_read;
              dbEntry.m_title = '';
              dbEntry.m_description = '';
              dbEntry.m_link = '';
              // TODO: when entry is fetched by the RSS loop, take care to respect IS_REMOTE_ONLY
              // TODO: don't overwrite the m_is_read flag
              return 0;
            }
          });
  }
  requestCompleted = true;

  // Check if the for() loop above ended up scheduling anything
  if (numCompleted == 0)
  {
    // No changes in the IndexedDB
    log.info(`rtHandlerSubs.handleEntryEvent: Nothing done for ENTRY_UPDATED or all was synchronous`);
    cbDone();
  }
}
rtHandlerEntries.prototype.handleEntryEvent = handleEntryEvent;

// object rtHandlerEntries.fullTableSync
// (Full Sync) Apply a full remote state locally
//
// Params:
// cbSynclocaltable -- Function of rtable, invoke to complete sync of
//                     remote table by supplying the local keys
// cbDone -- Chain in the completion callback
function fullTableSync(cbSyncLocalTable, cbDone)
{
  let self = this;

  // By not supplying the local entries we forgo deleting any local
  // entries if they are not in the remote table. This is not a
  // problem in the case of the RSS entries because they all age out
  // and are deleted locally automatically
  let localEntries = {};

  // This operation will ONLY bring any new entries that are in the
  // remote table (there will be no deletion events)
  cbSyncLocalTable(self.m_rtName, localEntries, cbDone);
}
rtHandlerEntries.prototype.fullTableSync = fullTableSync;

// object rtHandlerEntries.markAsSynced
// Set remote status of all entries as IS_SYNCED into the local
// Indexed DB
//
// Input:
// listRemoteEntries -- an array in the format sent for remote table operations,
//     see RemoteEntryRead() for the formation of the entry
// cbDone -- Invoke at the end to notify operation in the DB as completed
function markAsSynced(listRemoteEntries, cbDone)
{
  let self = this;

  let entryIndex = 0;
  let numCompleted = 0;
  let requestCompleted = false;
  let numEntries = listRemoteEntries.length;
  for (entryIndex = 0; entryIndex < listRemoteEntries.length; ++entryIndex)
  {
    let entry = listRemoteEntries[entryIndex];
    let entryHash = entry[0];  // First entry in the array is the hash (the key)
    let cnt = entryIndex;  // A copy in the current scope

    ++numCompleted;  // The number of expected completion callbacks
    self.m_feeds.feedUpdateEntry(entryHash,
        function(state, dbEntry)
        {
          if (state == 0)
          {
            utils_ns.assert(dbEntry.m_hash == entryHash, 'markEntriesAsSynched: bad data');

            // Already in the state it needs to be?
            if (dbEntry.m_remote_state == feeds_ns.RssSyncState.IS_SYNCED)
            {
              log.info(`rtHandlerEntries.markAsSynced: entry (${cnt}): [${entryHash}], ALREADY marked, skipping it`);
              return 1;  // Don't record in the DB
            }
            else
            {
              dbEntry.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;
              return 0;  // Record in the DB
            }
          }
          else if (state == 1)
          {
            log.error(`db: update entry (${cnt}): [${entryHash}], error not found`);
            return 1;  // Don't record in the DB
          }

          --numCompleted;

          // Everything already marked?
          if (requestCompleted && numCompleted == 0)
          {
            log.info(`markAsSynced: marked ${numEntries} as IS_SYNCED`);
            cbDone();
          }
        });
  }
  requestCompleted = true;

  // Check if the for() loop above ended up scheduling anything
  if (numCompleted == 0)
  {
    // No changes in the IndexedDB
    log.info(`rtHandlerEntries.markAsSynced:  Nothing needed to be marked as IS_SYNCED`);
    cbDone();
  }
}
rtHandlerEntries.prototype.markAsSynced = markAsSynced;

// object rtHandlerEntries.insert
// Schedules a row of data to be inserted in the remote table
function insert(rssEntry)
{
  let self = this;

  let newRemoteEntry = new RemoteEntryRead(rssEntry);
  self.m_feeds.m_rt.insert('rss_entries_read', newRemoteEntry);
}
rtHandlerEntries.prototype.insert = insert;

// export to feeds_rt_entries_ns namespace
feeds_rt_entries_ns.rtHandlerEntries = rtHandlerEntries;
})();
