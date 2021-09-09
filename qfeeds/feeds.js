// feeds.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Local database management of RSS feeds
// Polling loop for fetching fresh RSS data
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
  feeds_ns = {};

(function ()
{
"use strict";

// object Feeds.Feeds [constructor]
// Instantiate one per application
function Feeds()
{
  var self = this;

  self.m_feedsCB = null;  // call-backs

  self.m_rssFeeds = [];  // array of RssHeader, sorted by url
  self.m_listNotify = [];
  self.m_hook_feed_poll_completed = [];
  self.m_hook_feed_poll_completed.push(function ()
      {
        // Check if it is time to expire some old entries from DB on disk
        self.p_expireEntries();
      });
  self.m_hook_feed_poll_completed.push(function ()
      {
        // Compute size of entries on disk
        self.p_entriesCalcSize();
      });

  self.m_hook_once_per_day = [];

  self.m_prefs = {};  // App's preferences

  // Poll loop
  self.m_pollIndex = 0;
  self.m_timeoutID = null;
  self.m_loopIsSuspended = true;
  self.m_pollIntervalSec = 120 * 60;  // Interval between feeds poll in seconds (2h)
  self.m_fetchOrder = [];  // array of objects FetchEntryDescriptor

  self.m_db = null;
  self.m_rss_entry_cnt = 0;

  // Set to true if Dropbox status is logged in
  self.m_remote_is_connected = false;

  // Subscribed RSS feeds stored in Dropbox (rtable ID)
  self.m_remote_subscriptions_id = -1;

  // RSS entries that are marked as read stored in Dropbox
  // (rtable ID)
  self.m_remote_read_id = -1;

  // (object RTables)
  self.m_rt = null;

  // Handle events for a remote table of RSS subscriptions
  // (file: rss_subscriptions.fstate.json in Dropbox/Apps/QFeeds)
  self.m_rtSubs = null;

  // Handle events for a remote tale of status read of RSS feed entries
  // (file: rss_entries_read.fstate.json in Dropbox/Apps/QFeeds)
  self.m_rtEntries = null;

  // Setup the poll loop
  self.m_timeoutID = setTimeout(p_poll, 1, self);

  // DBSize (rough db size)
  self.m_dbsize = 0;
  self.m_dbentered = false; // TODO: remove
  self.m_numTotal = 0;
  self.m_numExpire = -1;
  self.m_totalSizeToExpire = -1;
  self.m_numDeleteErrors = 0;

  // Help strict mode detect miss-typed fields
  Object.preventExtensions(this);

  return this;
}

// object Feeds.setCbHandlers
// Sets the set of callbacks for load events from IndexedDB
// (This connects to the display methods in FeedsDir)
function setCbHandlers(feedsCB)
{
  var self = this;
  self.m_feedsCB = feedsCB;  // call-backs
}
Feeds.prototype.setCbHandlers = setCbHandlers;

// object Feeds.prefSet
// Sets a key, stores in the IndexedDB, sends it to remote table
// Sends only keys that start with "m_"
function prefSet(key, value)
{
  var self = this;
  self.m_prefs[key] = value;
  var newEntry2 = { m_pref: key, m_value: value };

  // Write the value in table 'preferences'
  // only if the new value is different
  var tran = self.m_db.transaction(['preferences'], 'readwrite');
  self.p_dbSetTranErrorLogging(tran, 'preferences', 'update.1');
  var store = tran.objectStore('preferences');
  log.trace("db: ('preferences') check for key: " + key);
  var req = store.get(key);
  req.onsuccess = function(event)
      {
        var data = req.result;
        var needsWrite = false;
        if (data === undefined)
          needsWrite = true;
        else
        {
          utils_ns.assert(data.m_pref == newEntry2.m_pref, "prefSet: Wrong key extracted");
          if (data.m_value != newEntry2.m_value)
            needsWrite = true;
        }
        if (needsWrite)
        {
          log.info("db: ('preferences', 'write') entry " + newEntry2.m_pref + ' = ' + newEntry2.m_value);

          var reqAdd = store.put(utils_ns.marshal(newEntry2, 'm_'));
          reqAdd.onsuccess = function(event)
              {
                var data = reqAdd.result;
                log.trace("db: ('preferences', 'write') done: " + newEntry2.m_pref);
              }
          reqAdd.onerror = function(event)
              {
                log.error("db: ('preferences', 'write') error for: " + newEntry2.m_pref);
                var error_msg = "db: ('preference', 'open') error: " + reqAdd.error.message;
                utils_ns.domError(error_msg);
              }
        }
      }
}
Feeds.prototype.prefSet = prefSet;

// object Feeds.prefGet
// Reads a pref value from the cached map
function prefGet(key)
{
  var self = this;
  return self.m_prefs[key];
}
Feeds.prototype.prefGet = prefGet;

// object Feeds.prefGetAll
// Reads a pref value from the cached map
function prefGetAll()
{
  var self = this;
  return self.m_prefs;
}
Feeds.prototype.prefGetAll = prefGetAll;

// object Feeds.p_dbSetTranErrorLogging
// Logs error or info for transactions in IndexedDB
function p_dbSetTranErrorLogging(tran, tableName, operation)
{
  var self = this;

  tran.oncomplete = function (event)
      {
        log.trace('db: (' + tableName + ', ' + operation + ') transaction completed');
      };
  tran.onabort = function (event)
      {
        var msg = 'db: (' + tableName + ', ' + operation + ') transaction aborted';
        log.error(msg)
        // This is usually secondary error and it overshadows the
        // actual display of the original error
        // utils_ns.domError(msg);
      };
  tran.onerror = function (event)
      {
        var msg = 'db: (' + tableName + ', ' + operation + ') transaction error';
        utils_ns.domError(msg);
      };
}
Feeds.prototype.p_dbSetTranErrorLogging = p_dbSetTranErrorLogging;

// object Feeds.p_dbReadAll
// Read all entries from a table in IndexedDB
function p_dbReadAll(tableName, cb_processEntry)
{
  var self = this;

  // Read the list of RSS subscriptions from IndexDB
  var cnt = 0;
  var tran = self.m_db.transaction(tableName, 'readonly');
  self.p_dbSetTranErrorLogging(tran, tableName, 'read');
  var s = tran.objectStore(tableName);
  var c = s.openCursor();
  c.onerror = function (event)
      {
        log.error('db: (' + tableName + ') cursor error');
      };
  c.onsuccess = function(event)
      {
        var cursor = event.target.result;
        if (!cursor)
        {
          log.info("db: ('" + tableName + "') " + cnt + ' entries retrieved');
          cb_processEntry(cursor);
          return;  // no more entries
        }
        cb_processEntry(cursor);
        ++cnt;
        cursor.continue();
      };
}
Feeds.prototype.p_dbReadAll = p_dbReadAll;

// object Feeds.prefReadAll
// Reads keys from indexedDB into local cache
function prefReadAll(cbDone)
{
  var self = this;

  self.p_dbReadAll('preferences',
      function(dbCursor)
      {
        if (!dbCursor)
        {
          if (cbDone != null)
            cbDone();
          return;  // no more entries
        }
        var hdr = dbCursor.value;
        self.m_prefs[hdr.m_pref] = hdr.m_value
      });
}
Feeds.prototype.prefReadAll = prefReadAll;

// object Feeds.p_prefSetListener
// A key was changed remotely
function p_prefSetListener(cbUpdates)
{
}
Feeds.prototype.p_prefSetListener = p_prefSetListener;

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
// Preserve old version for some time
// TODO: remove old version
// function RemoteEntryRead(rssEntry)
// {
//   this.m_rss_entry_hash = null;
//   this.m_rss_feed_hash = null;
//   this.m_is_read = false;
//   this.m_date = null;
//   if (rssEntry == null)  // An empty object was requested?
//     return this;

//   this.m_rss_entry_hash = rssEntry.m_hash;

//   var h = rssEntry.m_rssurl_date.indexOf('_');
//   utils_ns.assert(h >= 0, "RemoteEntryRead: invalid rssurl_date hash");
//   var rssurl_hash = rssEntry.m_rssurl_date.slice(0, h);
//   this.m_rss_feed_hash = rssurl_hash;

//   this.m_is_read = rssEntry.m_is_read;
//   this.m_date = utils_ns.dateToStrStrict(rssEntry.m_date);
//   // Strip the time (after '_')
//   // Date is sufficient for keeping the age of an entry
//   // Date is used only for the purpose of making an entry expire and be deleted
//   var limit = this.m_date.indexOf('_')
//   this.m_date = this.m_date.slice(0, limit)
//   return this;
// }

// object [old] RemoteFeedUrl [constructor]
// From an RssHeader constructs a RemoteFeedUrl record
// function RemoteFeedUrl(feed)
// {
//   this.m_rss_feed_hash = null;  // this is a key in the remote table
//   this.m_rss_feed_url = null;
//   this.m_tags = null;
//   if (feed == null)  // An empty object was requested?
//     return this;

//   this.m_rss_feed_hash = feed.m_hash;
//   this.m_rss_feed_url = feed.m_url;
//   this.m_tags = feed.m_tags;
//   return this;
// }

// object RemoteFeedUrl [constructor]
// From an RssHeader constructs a RemoteFeedUrl record
function RemoteFeedUrl(feed)
{
  if (feed == null)  // An empty object was requested?
    return [null, null, null]

  // url, tags, user-set options for the feed
  return [feed.m_url, feed.m_tags, ""];
}

// object Feeds.p_incExpireCount
// Increment the value of preference key 'm_local.app.expired_remote_records'
function p_incExpireCount()
{
  var self = this;

  var strCnt = self.prefGet("m_local.feeds.expired_remote_records");
  var cnt = 0;
  if (strCnt !== undefined)
  {
    cnt = parseInt(strCnt);
    if (isNaN(cnt))
      cnt = 0;
  }
  ++cnt;
  self.prefSet("m_local.feeds.expired_remote_records", cnt.toString());
}
Feeds.prototype.p_incExpireCount = p_incExpireCount;

// object [old] Feeds.p_rtableRemoteEntryReadListener
// Handle updates from the remote tables for 'rss_entries_read'
function p_rtableRemoteEntryReadListener(records)
{
  var self = this;

  var k = 0;
  var r = null;
  for (k = 0; k < records.length; ++k)
  {
    (function()  // scope
    {
      r = records[k];

      // Skip operation if it is local
      if (r.isLocal)  // our own loop-back?
        return;  // leave the anonymous scope

      // Skip operation if it is remote delete
      // Local delete will take place when scheduled
      if (r.isDeleted)  // remotely deleted?
        return;  // leave the anonymous scope

      // Reflect the new state on the screen (if the feed is currently displayed)
      self.m_feedsCB.onRemoteMarkAsRead(r.data.m_rss_entry_hash, r.data.m_rss_feed_hash, r.data.m_is_read);

      // Check if the entry is too old and needs to be remove from the remote table (expired)
      var rss_entry_hash = r.data.m_rss_entry_hash;
      var is_read = r.data.m_is_read;
      var dateEntry = utils_ns.parseStrictDateStr(r.data.m_date);
      if (feeds_ns.isTooOldDate(dateEntry))
      {
        log.trace('Expire entry ' + r.data.m_date);
        self.m_rtGDrive.deleteRec(self.m_remote_read_id, rss_entry_hash);
        self.p_incExpireCount();
      }

      // Apply new state in the IndexedDB
      self.feedUpdateEntry(rss_entry_hash,
          function(state, dbEntry)
          {
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
    })()
  }
}
Feeds.prototype.p_rtableRemoteEntryReadListener = p_rtableRemoteEntryReadListener;

// object Feeds.p_feedFindByHash
// Find feed by its hash. This is a slow operation -- linear to the
// size of the list of feeds
function p_feedFindByHash(feed_hash)
{
  var self = this;
  var x = 0;
  var feed = null;
  for (x = 0; x < self.m_rssFeeds.length; ++x)
  {
    feed = self.m_rssFeeds[x];
    if (feed.m_hash == feed_hash)
      return x;
  }
  return -1;
}
Feeds.prototype.p_feedFindByHash = p_feedFindByHash;

// object Feeds.p_feedFindByUrl
// Find feed by its URL. Uses binary search operation.
function p_feedFindByUrl(feedUrl)
{
  var self = this;

  // Find feed in the list of feeds
  var feed = feeds_ns.emptyRssHeader();
  feed.m_url = feedUrl;

  // Find into the sorted m_rssFeeds[]
  var m = self.m_rssFeeds.binarySearch(feed, compareRssHeadersByUrl);
  return m;
}
Feeds.prototype.p_feedFindByUrl = p_feedFindByUrl;

function getStats()
{
  var self = this;

  var entryGDrive =
  {
    groupName: 'GDrive (not activated)',
    values: []
  };

  if (self.m_rtGDrive != null)
  {
    var gdriveStats = self.m_rtGDrive.getStats();

    var strCnt = self.prefGet("m_local.feeds.expired_remote_records");
    var cntExpired = 0;
    if (strCnt !== undefined)
    {
      cntExpired = parseInt(strCnt);
      if (isNaN(cntExpired))
        cntExpired = 0;
    }

    entryGDrive =
    {
      groupName: 'GDrive usage by "r-rss"',
      values:
      [
        {
          name: 'Tables file',
          value: gdriveStats.table
        },
        {
          name: 'Bytes used',
          value: utils_ns.numberWithCommas(gdriveStats.bytes)
        },
        {
          name: 'Max size limit by GDrive',
          value: gdriveStats.maxBytes
        },
        {
          name: 'Number of records',
          value: gdriveStats.records
        },
        {
          name: 'Number of expired',
          value: cntExpired + ' (from this instance only)'
        },
        {
          name: 'GDrive workaround counter',
          value: gdriveStats.cntToken
        },
        {
          name: 'GDrive non-fatal HTTP400',
          value: gdriveStats.cnt400
        }
      ]
    }
  }

  var sizeStr = '(computation pending)'
  if (self.m_dbsize > 0)
    sizeStr = utils_ns.numberWithCommas(self.m_dbsize) + ' (rough size in bytes)'
  var cntStr = '(count pending)'
  if (self.m_numTotal > 0)
    cntStr = utils_ns.numberWithCommas(self.m_numTotal)
  var expiredSizeStr = '(nothing expired yet)'
  if (self.m_totalSizeToExpire != -1)
    expiredSizeStr = utils_ns.numberWithCommas(self.m_totalSizeToExpire) + ' (rough size in bytes)'
  var expiredCntStr = '(nothing expired yet)'
  if (self.m_numExpire != -1)
    expiredCntStr = utils_ns.numberWithCommas(self.m_numExpire)
  var strSinceLastExpireCycle = '(never expired)'
  var elapsedTimeMs = self.p_timeSinceLastDBExpireCycle();  // In milliseconds
  if (elapsedTimeMs != -1)  // No date was yet recorded, first time call
  {
    var elapsedHours = elapsedTimeMs / (60.0 * 60.0 * 1000);
    strSinceLastExpireCycle = utils_ns.numberWith2Decimals(elapsedHours) + ' hours';
  }
  var strSinceLastOncePerDay = '(never executed)'
  elapsedTimeMs = self.p_timeSinceLastOncePerDay();  // In milliseconds
  if (elapsedTimeMs != -1)  // No date was yet recorded, first time call
  {
    var elapsedHours = elapsedTimeMs / (60.0 * 60.0 * 1000);
    strSinceLastOncePerDay = utils_ns.numberWith2Decimals(elapsedHours) + ' hours';
  }

  var entryFeeds =
  {
    groupName: 'Feeds',
    values:
    [
      {
        name: 'Total number',
        value: self.m_rssFeeds.length
      },
      {
        name: 'Number of individual entries',
        value: cntStr,
      },
      {
        name: 'Size on disk',
        value: sizeStr
      },
      {
        name: 'Time since last hook "once per day"',
        value: strSinceLastOncePerDay
      },
    ]
  }

  var entryExpired =
  {
    groupName: 'Purge of expired entries from disk (last operation only)',
    values:
    [
      {
        name: 'Deleted entries',
        value: expiredCntStr
      },
      {
        name: 'Size saved on disk',
        value: expiredSizeStr
      },
      {
        name: 'Time since last purge',
        value: strSinceLastExpireCycle
      },
      {
        name: 'Delete errors',
        value: self.m_numDeleteErrors
      }
    ]
  }

  var stats = [entryGDrive, entryFeeds, entryExpired];
  return stats;
}
Feeds.prototype.getStats = getStats;

// object [old] Feeds.p_rtableRemoteFeedsListenerOld
// Handle updates from the remote tables for 'rss_subscriptions'
function p_rtableRemoteFeedsListenerOld(records)
{
  var self = this;
  var k = 0;
  var r = null;
  for (k = 0; k < records.length; ++k)
  {
    (function()  // scope
    {
      r = records[k];

      // Skip operation if it is local
      if (r.isLocal)  // our own loop-back?
        return;  // leave the anonymous scope

      var x = null;

      // Skip operation if it is remote delete
      // Local delete will take place when scheduled
      if (r.isDeleted)  // remotely deleted?
      {
        x = self.p_feedFindByHash(r.id);
        if (x == -1)
        {
          log.warn('p_rtableRemoteFeedsListener: unknown feed ' + r.id);
          return;
        }
        log.info('rtable_event: deleted remotely -- ' + self.m_rssFeeds[x].m_url);
        self.p_feedRemove(self.m_rssFeeds[x].m_url, false);
        self.m_feedsCB.onRemoteFeedDeleted(r.id);
        return;  // leave the anonymous scope
      }

      x = self.p_feedFindByHash(r.data.m_rss_feed_hash);

      // A record was added or updated
      var newFeed = null;
      if (x == -1)   // Update or addition of a new feed from a remote operation
      {
        newFeed = feeds_ns.emptyRssHeader();
      }
      else
      {
        // We already have such feed locally: this is an update operation
        newFeed = feeds_ns.copyRssHeader(self.m_rssFeeds[x]);
      }
      // Now apply the data that come from the remote operation
      newFeed.m_hash = r.data.m_rss_feed_hash;
      newFeed.m_url = r.data.m_rss_feed_url;
      newFeed.m_tags = r.data.m_tags;
      newFeed.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;

      // Put into local list of RSS subscriptions (self.m_rssFeeds)
      self.p_feedInsert(newFeed);

      self.p_feedRecord(newFeed, false,
          function(wasUpdated)
          {
            if (wasUpdated == 1)
            {
              // New feed -> fetch RSS data
              self.p_fetchRss(newFeed.m_url, null,
                  function()  // CB: write operation is completed
                  {
                    // If any extra activation/display is needed
                    self.m_feedsCB.onRemoteFeedUpdated(newFeed.m_url, newFeed.m_tags);
                  });
            }
            else
              log.info('p_rtableRemoteFeedsListener: nothing to do for ' + newFeed.m_url);
          });
    })()
  }
}
Feeds.prototype.p_rtableRemoteFeedsListenerOld = p_rtableRemoteFeedsListenerOld;

// object [old] Feeds.p_rtableListener
// Handle updates from the remote tables
function p_rtableListener(table_id, records)
{
  var self = this;

  if (table_id == self.m_remote_subscriptions_id)  // 'rss_subscriptions'
  {
    self.p_rtableRemoteFeedsListener(records);
    return;
  }

  if (table_id == self.m_remote_read_id) // 'rss_entries_read'
  {
    self.p_rtableRemoteEntryReadListener(records);
    return;
  }
}
Feeds.prototype.p_rtableListener = p_rtableListener;

// object [old] Feeds.p_rtableSyncEntry
// Sync one RSS entry with the remote table
function p_rtableSyncEntry(rssEntry)
{
  // We can't use _instanceof_ for objects that are read from the indexedDB
  // just check for some fields to confirm this is RssEntry object
  utils_ns.hasFields(rssEntry, ['m_is_read', 'm_rssurl_date'], 'p_rtableSyncEntry');

  var self = this;

  var remoteEntry = null;
  var remoteId = null;

  if (self.m_remote_is_connected)
  {
    remoteEntry = new RemoteEntryRead(rssEntry);
    self.m_rtGDrive.insert(self.m_remote_read_id, remoteEntry);
    rssEntry.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;
    log.trace('rtableSyncEntry: remote OK (' + rssEntry.m_hash + ')');
  }
  else
  {
    // Data can't be sent, mark it for sending at the next opportunity
    rssEntry.m_remote_state = feeds_ns.RssSyncState.IS_PENDING_SYNC;
    log.info('rtableSyncEntry: local only (' + rssEntry.m_hash + ' -> IS_PENDING_SYNC)');
  }
}
Feeds.prototype.p_rtableSyncEntry = p_rtableSyncEntry;

// object [old] Feeds.p_rtableSyncFeedEntry
// Sync one RSS feed (RSSHeader) entry with the remote table
function p_rtableSyncFeedEntry(feed)
{
  utils_ns.assert(false, "Invoking an OLD method");

  // We can't use _instanceof_ for objects that are read from the indexedDB
  // just check for some fields to confirm this is RssHeader object
  utils_ns.hasFields(feed, ['m_rss_type', 'm_rss_version'], 'p_rtableSyncFeedEntry');

  var self = this;

  var localFeed = null;
  var remoteFeed = null;
  var m = 0;

  m = self.p_feedFindByUrl(feed.m_url);
  if (m >= 0)
    localFeed = self.m_rssFeeds[m];
  else
    localFeed = null;

  if (self.m_remote_is_connected)
  {
    remoteFeed = new RemoteFeedUrl(feed);
    self.m_rtGDrive.insert(self.m_remote_subscriptions_id, remoteFeed);
    localFeed.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;

    // Reflect in feed copy which will be recorded back into the IndexedDB
    feed.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;

    log.trace('p_rtableSyncFeedEntry: remote OK (' + remoteFeed.m_rss_feed_url + ')');
  }
  else
  {
    // Data can't be sent, mark it for sending at the next opportunity
    feed.m_remote_state = feeds_ns.RssSyncState.IS_PENDING_SYNC;
    if (localFeed != null)
      localFeed.m_remote_state = feeds_ns.RssSyncState.IS_PENDING_SYNC;
    log.info('p_rtableSyncFeedEntry: local only (' + feed.m_rss_feed_url + ' -> IS_PENDING_SYNC)');
  }
}
Feeds.prototype.p_rtableSyncFeedEntry = p_rtableSyncFeedEntry;

// object [old] Feeds.p_rtableSyncStatusRead
// Walk over all RSS entry records in the local DB and send to
// remote table:
// 1. all that were marked as read (feeds_ns.RssSyncState.IS_LOCAL_ONLY)
// 2. all that were marked as feeds_ns.RssSyncState.IS_PENDING_SYNC
// NOTE: By not sending is_read = false && IS_LOCAC_ONLY we
// temporarely save a bit of space on the remote DB
function p_rtableSyncStatusRead()
{
  var self = this;

  self.updateEntriesAll(
      function(rssEntry)
      {
        if (rssEntry == null)  // No more entries
          return 0;

        if (rssEntry.m_remote_state == feeds_ns.RssSyncState.IS_LOCAL_ONLY)
        {
          // Record all read entries in the remote table
          if (rssEntry.m_is_read)
          {
            log.info('rtableSyncStatusRead: complete pending operation (' + rssEntry.m_hash + ')');
            self.p_rtableSyncEntry(rssEntry);
            return 1;  // Update entry
          }
        }

        if (rssEntry.m_remote_state == feeds_ns.RssSyncState.IS_PENDING_SYNC)
        {
          // Record all read entries in the remote table
          log.info('rtableSyncStatusRead: mark as pending operation (' + rssEntry.m_hash + ')');
          self.p_rtableSyncEntry(rssEntry);
          return 1;  // Update entry
        }

        return 2;  // No changes to the entry, move to the next
      });
}
Feeds.prototype.p_rtableSyncStatusRead = p_rtableSyncStatusRead;

// object [old] Feeds.p_rtableSyncRemoteSubscriptions
// Walk over all RSS feed records in the local DB and send to
// remote table if m_remote_status is feeds_ns.RssSyncState.IS_LOCAL_ONLY)
function p_rtableSyncRemoteSubscriptions(cbDone)
{
  var self = this;

  self.p_feedsUpdateAll(
      function(feed)
      {
        if (feed == null)  // No more entries
        {
          if (cbDone != null)
            cbDone();
          return 0;
        }

        if (feed.m_remote_state == feeds_ns.RssSyncState.IS_LOCAL_ONLY)
        {
          // Record all read entries in the remote table
          log.info('p_rtableSyncRemoteSubscriptions: complete pending operation add (' + feed.m_url + ')');
          self.p_rtableSyncFeedEntry(feed);
          return 1;  // Update entry
        }

        if (feed.m_remote_state == feeds_ns.RssSyncState.IS_PENDING_SYNC)
        {
          // Record all read entries in the remote table
          log.info('p_rtableSyncRemoteSubscriptions: mark as pending operation (' + feed.m_url + ')');
          self.p_rtableSyncFeedEntry(feed);
          return 1;  // Update entry
        }

        return 2;  // No changes to the entry, move to the next
      });
}
Feeds.prototype.p_rtableSyncRemoteSubscriptions = p_rtableSyncRemoteSubscriptions;

// object [old] Feeds.p_rtableInitRemoteEntryRead
// Initialize remote table (rtable) that stores status_read for RSS entries
function p_rtableInitRemoteEntryRead(cbDisplayProgress)
{
  var self = this;

  // One listener for all tables
  feeds_ns.RTablesAddListener(function (table, records)
      {
        self.p_rtableListener(table, records);
      });

  // There are two ways for getting data from Dropbox's datastore
  // 1. Listen to events: these changes are reflected into the local
  //    indexed db.
  // 2. Do a query for an individual entry. Feeds objec never does #2,
  //    it relies exclusively on faithfully mirroring the events.
  //
  // At startup time, Dropbox's datastore brings all entries that were
  // updated remotely but doesn't generate corresponding
  // events. Unfortunately, we have to do a full datastore query that
  // walks all entries only to discover what changed remotely.
  self.m_rtGDrive.initialSync(self.m_remote_read_id, null, function(progress)
    {
      // We get progress from 0 to 100%, fit it as progress from 10% to 55%
      var range = 55 - 10;
      var global = (range / 100.0) * progress + 10;
      cbDisplayProgress(global);
    });

  // Walk over all RSS entry records in the local DB and send to
  // remote table all that were marked as read
  self.p_rtableSyncStatusRead();
}
Feeds.prototype.p_rtableInitRemoteEntryRead = p_rtableInitRemoteEntryRead;

// object [old] Feeds.p_rtableInitRemoteFeedUrl
// Initialize remote table (rtable) that stores url of RSS feeds
function p_rtableInitRemoteFeedUrl(cbDisplayProgress)
{
  var self = this;

  // Prepare a map of all subscriptions from the local list
  var k = 0;
  var entry = null;
  var localEntries = {};
  for(k = 0; k < self.m_rssFeeds.length; ++k)
  {
    var entry = self.m_rssFeeds[k];
    localEntries[entry.m_hash] = 0;
  }

  // First any unsynched local to remote
  log.info('feeds: send unsynched RSS subscriptions to remote table rss_subscriptions');
  self.p_rtableSyncRemoteSubscriptions(
    function()  // Done sending unsynched elements from local DB to remote table 'rss_subscriptions'
    {
      log.info('feeds: done, unsynched -> remote table rss_subscriptions');
      // Now bring any unknown remote locally, delete any that remain local only
      log.info('feeds: bring any new entries from remote table rss_subscriptions to local DB');
      self.m_rtGDrive.initialSync(self.m_remote_subscriptions_id, localEntries, function(progress)
      {
        // We get progress from 0 to 100%, fit it as progress from 55% to 100%
        var range = 100 - 55;
        var global = (range / 100.0) * progress + 55;
        if (progress == 100)
          global = 100;  // Avoid float roundup errors
        cbDisplayProgress(global);
      });
    });
}
Feeds.prototype.p_rtableInitRemoteFeedUrl = p_rtableInitRemoteFeedUrl;

// object none.p_demoDropboxSync
function p_demoDropboxSync(self)
{
  let all = [];

  self.updateEntriesAll(
      function(rssEntry)
      {
        if (rssEntry == null)  // No more entries
        {
          feeds_ns.demoWriteAll(all);
          return 0;
        }

        let remoteEntry = new RemoteEntryRead(rssEntry);
        let newRemoteEntry = [
          remoteEntry['entry'],
          remoteEntry['feed'],
          remoteEntry['is_read'],
          remoteEntry['date']
        ]
        all.push(JSON.stringify(newRemoteEntry));
        return 2;  // No changes to the entry, move to the next
      });
}

// object Feeds.p_rtableSyncEntryRead
// Sync one RSS entry (status read) with the remote table
function p_rtableSyncEntryRead(rssEntry)
{
  // We can't use _instanceof_ for objects that are read from the indexedDB
  // just check for some fields to confirm this is RssEntry object
  utils_ns.hasFields(rssEntry, ['m_is_read', 'm_rssurl_date'], 'p_rtableSyncEntryRead');

  var self = this;

  if (!self.m_remote_is_connected)
  {
    rssEntry.m_remote_state = feeds_ns.RssSyncState.IS_LOCAL_ONLY;
  }
  else
  {
    self.m_rtEntries.insert(rssEntry)
  }
}
Feeds.prototype.p_rtableSyncEntryRead = p_rtableSyncEntryRead;

// object [old] Feeds.p_rtableSubsSetSync
// TODO: remove
// Walk over all RSS subscription records in the local DB,
// for all entries marked as IS_SYNC_IN_PROGRESS set new state
// (newSyncState will be IS_SYNCED or IS_LOCAL_ONLY)
function p_rtableSubsSetSync(newSyncState, cbDone)
{
  let self = this;

  self.p_feedsUpdateAll(
      function(feed)
      {
        if (feed == null)  // No more entries
        {
          if (cbDone != null)
            cbDone();
          return 0;
        }

        if (feed.m_remote_state == feeds_ns.RssSyncState.IS_SYNC_IN_PROGRESS)
        {
          // Record all read entries in the remote table
          let strState = '!BAD!';
          if (newSyncState == feeds_ns.RssSyncState.IS_SYNCED)
            strState = 'IS_SYNCED';
          if (newSyncState == feeds_ns.RssSyncState.IS_LOCAL_ONLY)
            strState = 'IS_LOCAL_ONLY';
          log.trace('p_rtableSubsSetSync: mark as ' + strState + ' for (' + feed.m_url + ')');
          feed.m_remote_state = newSyncState;
          return 1;  // Update entry
        }

        // No changes to the entry, move to the next
        return 2;
      });
}
Feeds.prototype.p_rtableSubsSetSync = p_rtableSubsSetSync;

// object Feeds.handleRTevent()
// Handle events from remote tables
function handleRTEvent(self, event)
{
  if (event.event == 'WRITE_FULL_STATE')
  {
    // Overwrite remote table with a complete state
    //
    // This event comes when the remote table is empty
    // (or any other reason requiring a compolete rewrite)
    if (event.tableName == 'rss_subscriptions')
    {
      log.info('feeds: Full write of table `rss_subscriptions\'');
      self.m_rtSubs.fullTableWrite(self.m_rt, function (code)
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);

            if (code == 0)
            {
              // Status write OK
            }
          });
    }
    else if (event.tableName == 'rss_entries_read')
    {
      log.info('feeds: Full write of table `rss_entries_read\'');
      self.m_rtEntries.fullTableWrite(self.m_rt, function (code)
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);

            if (code == 0)
            {
              // Status write OK
            }
          });
    }
    else
    {
      utils_ns.assert(false,
          "handleRTEvent: event for an invalid table '" + event.tableName + "'");
    }
  }
  else if (event.event == 'SYNC_FULL_STATE')
  {
    // Make local table reflect fully the remote table
    // This event is generated by a change in the remote table
    if (event.tableName == 'rss_subscriptions')
    {
      log.info('feeds: Full sync of table `rss_subscriptions\'');
      self.m_rtSubs.fullTableSync(event.cbSyncLocalTable, function ()
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);
          });
    }
    else if (event.tableName == 'rss_entries_read')
    {
      log.info('feeds: Full sync of table `rss_entries_read\'');
      self.m_rtEntries.fullTableSync(event.cbSyncLocalTable, function ()
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);
          });
    }
    else
    {
      utils_ns.assert(false,
          "handleRTEvent: event for an invalid table '" + event.tableName + "'");
    }
  }
  else if (event.event == 'ENTRY_UPDATE')
  {
    // Remote entries were updated (new values or deleted)
    if (event.tableName == 'rss_subscriptions')
    {
      log.info('feeds: Full sync of table `rss_subscriptions\'');
      self.m_rtSubs.handleEntryEvent(event.data, function ()
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);
          });
    }
    else if (event.tableName == 'rss_entries_read')
    {
      self.m_rtEntries.handleEntryEvent(event.data, function ()
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);
          });
    }
    else
    {
      utils_ns.assert(false,
          "handleRTEvent: event for an invalid table '" + event.tableName + "'");
    }
  }
  else if (event.event == 'MARK_AS_SYNCED')
  {
    // Make local table reflect fully the remote table
    // This event is generated by a change in the remote table
    if (event.tableName == 'rss_subscriptions')
    {
      self.m_rtSubs.markAsSynced(event.data, function ()
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);
          });
    }
    else if (event.tableName == 'rss_entries_read')
    {
      log.info('feeds: Mark as synced for table `rss_entries_read\'');
      self.m_rtEntries.markAsSynced(event.data, function ()
          {
            // Tell the event queue to proceeed with the next event
            self.m_rt.eventDone(event.tableName);
          });
    }
    else
    {
      utils_ns.assert(false,
          "handleRTEvent: event for an invalid table '" + event.tableName + "'");
    }
  }
  else if (event.event == 'EMPTY_EVENT')
  {
    // For debug purposes: immediately call eventDone()
    log.info(`feeds: EMPTY_EVENT for \`${event.tableName}\'`);
    self.m_rt.eventDone(event.tableName);
  }
  else
  {
    log.info(`feeds: handleRTEvent(): unhandled ${event.event} for \`${event.tableName}\'`);
  }
}

// object Feeds.rtableConnect
// This method is invoked once when the application is logged into Dropbox
function rtableConnect(cbDisplayProgress)
{
  var self = this;

  log.info('rtableConnect()...');

  self.m_remote_is_connected = true;

  // p_demoDropboxSync(self);

  var tables =
  [
    // List of all of the feeds URLs
    {name: 'rss_subscriptions', formatVersion: 1},

    // All entries that were marked as read
    {name: 'rss_entries_read', formatVersion: 1}
  ];

  self.m_rtSubs = new feeds_rt_subs_ns.rtHandlerSubs(self, 'rss_subscriptions');
  self.m_rtEntries = new feeds_rt_entries_ns.rtHandlerEntries(self, 'rss_entries_read');

  // For now use profile 'Default'
  self.m_rt = new feeds_ns.RTables('Default', tables, function (event)
      {
        handleRTEvent(self, event);
      });

  return;

  // TODO: Remove this eventually when the NEW Dropbox is completed

  // Delete all pending (m_is_unsubscribed = true), now that Dropbox is
  // logged in (these are entries that are in state IS_LOCAL_ONLY or
  // IS_SYNCED)
  self.p_feedPendingDeleteDB(true);

  var tables =
  [
    {name: 'rss_subscriptions', key: 'm_rss_feed_hash'},
    {name: 'rss_entries_read', key: 'm_rss_entry_hash'}
  ];
  self.m_remote_subscriptions_id = 0;
  self.m_remote_read_id = 1;
  self.m_rtGDrive = new feeds_ns.RTablesGDrive(tables, function (code)
      {
        if (code == 0)
        {
          log.warn('feeds: failed to connect to GDrive')
          return;
        }

        self.p_rtableInitRemoteEntryRead(cbDisplayProgress);
        self.p_rtableInitRemoteFeedUrl(cbDisplayProgress);
      },
      cbDisplayProgress);
}
Feeds.prototype.rtableConnect = rtableConnect;

// object Feeds.rtableDisconnect
// This method is invoked once when the application is logged out from Dropbox
function rtableDisconnect()
{
  self.m_remote_is_connected = false;
}
Feeds.prototype.rtableDisconnect = rtableDisconnect;

// object Feeds.p_feedReadAll
// Load list of feeds (RssHeaders) from IndexedDB
function p_feedReadAll(cbDone)
{
  var self = this;
  var feeds = [];

  self.p_dbReadAll('rss_subscriptions',
      function(dbCursor)
      {
        if (!dbCursor)
        {
          self.p_feedInsertBatch(feeds);
          if (cbDone != null)
            cbDone();
          return;  // no more entries
        }
        var hdr = dbCursor.value;
        // Just collect and insert in a batch at the end
        if (!hdr.m_is_unsubscribed)
          feeds.push(feeds_ns.copyRssHeader(hdr));
      });
}
Feeds.prototype.p_feedReadAll = p_feedReadAll;

// object Feeds.p_feedPendingDeleteDB
// Delete permanently from IndexedDB the feeds marked as m_is_unsubscribed
function p_feedPendingDeleteDB(needsRTableSync)
{
  var self = this;
  var listToRemove = [];

  // Read the list of RSS subscriptions from IndexDB
  var cnt = 0;
  var tran = self.m_db.transaction('rss_subscriptions', 'readonly');
  self.p_dbSetTranErrorLogging(tran, 'rss_subscriptions', 'read');
  var s = tran.objectStore('rss_subscriptions');
  var c = s.openCursor();
  c.onerror = function (event)
      {
        log.error("db: ('rss_subscriptions', 'read') cursor error");
      };
  c.onsuccess = function(event)
      {
        var cursor = event.target.result;
        if (!cursor)
        {
          // `cursor' is null when `cursor.continue()' reaches end of DB index
          log.info("db: ('rss_subscriptions') " + listToRemove.length + ' subscriptions marked as unsubscribed');
          self.p_feedRemoveList(listToRemove, needsRTableSync);
          return;  // no more entries
        }
        var hdr = cursor.value;
        if (hdr.m_is_unsubscribed)
          listToRemove.push(feeds_ns.copyRssHeader(hdr));
        ++cnt;
        cursor.continue();
      };
}
Feeds.prototype.p_feedPendingDeleteDB = p_feedPendingDeleteDB;

// object Feeds.dbOpen
// This completes the initialization of the Feeds object
function dbOpen(cbDone)
{
  var self = this;

  log.info("db: ('rrss', 'open') connect to Feeds database...");
  var req = window.indexedDB.open('rrss', 1);
  req.onerror = function (event)
      {
        // Global error handler for all database errors
        utils_ns.domError("db: ('rrss', 'open') error: " + req.errorCode);
      };
  req.onblocked = function (event)
      {
        utils_ns.domError("db: ('rrss', 'open') Feeds database is still in use by another instance");
      }
  req.onsuccess = function (event)
      {
        log.info("db: ('rrss', 'open') Feeds database already exists");
        var db = req.result;
        log.info(db.objectStoreNames);

        self.m_db = db;
        // Delete only if it is safe without Dropbox yet logged in
        // (only entries that are IS_LOCAL_ONLY can be deleted, if
        // you've never logged into Dropbox all entries are
        // LOCAL_ONLY)
        self.p_feedPendingDeleteDB(false);
        log.info("db: ('rrss', 'open') Done1");
        cbDone();
      };
  req.onupgradeneeded = function(event)
      {
        log.info("db: ('rrss', 'open') first time, create tables of Feeds DB...");
        var db = event.target.result;

        // Records of type RssHeader
        var s = db.createObjectStore('rss_subscriptions', { keyPath: 'm_url' });
        log.info("db: ('rrss', 'open') table 'rss_subscriptions' start create operation");

        // Records of type RssEntry
        var d1 = db.createObjectStore('rss_data', { keyPath: 'm_hash' });
        log.info("db: ('rrss', 'open') table 'rss_data' start create operation");

        d1.createIndex('rssurl_date', 'm_rssurl_date', { unique: false });
        log.info("db: ('rrss', 'open') index 'rssurl_date' created");

        // Records of pref=value: store user preferences as k/v pairs
        var d2 = db.createObjectStore('preferences', { keyPath: 'm_pref' });
        log.info("db: ('rrss', 'open') table 'preferences' start create operation");

        self.m_db = db;

        // All create transactions endup with a single "oncomplete" call
        d2.transaction.oncomplete = function(event)
            {
              log.info("db: ('rrss', 'open') all tables and indexes of Feeds DB created");
              self.m_feedsCB.onDbCreated();

              log.info("db: ('rrss', 'open') Done2");
              // Now IndexedDB calls req.onsuccess()
            };
      };
}
Feeds.prototype.dbOpen = dbOpen;

// object Feeds.dbLoad
// Load data that is permanently in memory
function dbLoad(cbDone)
{
  var self = this;

  // Load all entries into memory for display and for fetch loop
  self.p_feedReadAll(
      function()
      {
        log.info('db: all feeds loaded from IndexedDB, start the RSS fetch loop');
        self.m_feedsCB.onDbInitDone();
        cbDone();
      });
}
Feeds.prototype.dbLoad = dbLoad;

// function compareRssHeadersByUrl
// for binarySearch()
function compareRssHeadersByUrl(feed1, feed2)
{
  if (feed1.m_url > feed2.m_url)
    return 1;
  if (feed1.m_url < feed2.m_url)
    return -1;
  return 0;
}

// object Feeds.p_feedInsert
// Insert a feed (RSSHeader) to the cached list of feeds (self.m_rssFeeds)
function p_feedInsert(newFeed)
{
  var self = this;

  // Find insertion point into the sorted m_rssFeeds[]
  var r = null;
  var origFeed = null;
  var m = self.m_rssFeeds.binarySearch(newFeed, compareRssHeadersByUrl);
  if (m >= 0)  // Entry with this url is already in
  {
    origFeed = self.m_rssFeeds[m];
    r = self.p_feedNeedsUpdate(newFeed, origFeed, false);
    if (!r.needsUpdate)
      return;

    // replace
    self.m_rssFeeds[m] = newFeed;
  }
  else
  {
    m = -(m + 1);
    if (m >= self.m_rssFeeds.length)  // add?
      self.m_rssFeeds.push(newFeed);
    else  // insert
      self.m_rssFeeds.splice(m, 0, newFeed);
  }

  // Notify event subscribers
  var listNewFeeds = new Array();
  listNewFeeds.push(newFeed);
  self.m_feedsCB.onRssUpdated(listNewFeeds);
}
Feeds.prototype.p_feedInsert = p_feedInsert;

// object Feeds.p_feedAdd
// add a feed (RSSHeader) to list of feeds, fetch the RSS for this feed
function p_feedAdd(newFeed, cbDone)
{
  var self = this;

  self.p_feedInsert(newFeed);

  // Fetch the RSS data for this URL, update the subscribed listeners
  self.p_fetchRss(newFeed.m_url, null,
      function()  // CB: write operation is completed
      {
        if (cbDone != null)
          cbDone();
      });
}
Feeds.prototype.p_feedAdd = p_feedAdd;

// object Feeds.p_feedInsertBatch
// Insert a batch of feeds (RSSHeader) to list of feeds m_rssFeeds
function p_feedInsertBatch(feeds)
{
  var self = this;
  var i = 0;
  var newFeed = null;
  var m = 0;

  for (i = 0; i < feeds.length; ++i)
  {
    newFeed = feeds[i];

    // Find insertion point into the sorted m_rssFeeds[]
    m = self.m_rssFeeds.binarySearch(newFeed, compareRssHeadersByUrl);
    if (m >= 0)  // Entry with this url is already in
      return;

    m = -(m + 1);
    if (m >= self.m_rssFeeds.length)  // add?
      self.m_rssFeeds.push(newFeed);
    else  // insert
      self.m_rssFeeds.splice(m, 0, newFeed);
  }

  // Notify event subscribers (single notification for the entire batch)
  self.m_feedsCB.onRssUpdated(feeds);
}
Feeds.prototype.p_feedInsertBatch = p_feedInsertBatch;

// object Feeds.p_feedOnDbError1
function p_feedOnDbError1(msg, tableName, url, cbResult, r)
{
  var self = this;

  var m = -1;
  var feed = null;

  log.error('db: (' + tableName + ') ' + msg);

  if (url != null)
  {
    m = self.p_feedFindByUrl(url);
    if (m >= 0)
    {
      feed = self.m_rssFeeds[m];
      feed.m_pending_db = false;
    }
  }

  if (cbResult != null)  // Notifier callback provided?
    cbResult(0);  // Notify that no update was needed
}
Feeds.prototype.p_feedOnDbError1 = p_feedOnDbError1;

// object Feeds.p_feedNeedsUpdate
function p_feedNeedsUpdate(newFeed, origFeed, shouldCompareRemoteStateOnly)
{
  var self = this;
  var r =
      {
        needUpdate: false,
        needsRTableSync: false
      }

  // For entry comming from RTable check only m_tags and m_remote_state, all else is empty!
  if (shouldCompareRemoteStateOnly)
  {
    if (newFeed.m_tags != origFeed.m_tags)
    {
      log.info('db: new remote tags: ' + newFeed.m_tags + ' ' +
                  '(old: ' + origFeed.m_tags + ')');
      r.needsUpdate = true;
    }
    if (newFeed.m_remote_state != origFeed.m_remote_state)
    {
      log.info('db: new remote state: ' + newFeed.m_remote_state + ' ' +
                  '(old: ' + origFeed.m_remote_state + ')');
      r.needsUpdate = true;
    }
  }
  else
  {
    log.info('db: entry already in [' + newFeed.m_url + ']');
    if (newFeed.m_title != origFeed.m_title)
    {
      log.info('db: new title: ' + newFeed.m_title + ' (old: ' + origFeed.m_title + ')');
      r.needsUpdate = true;
    };
    if (newFeed.m_link != origFeed.m_link)
    {
      log.info('db: new link: ' + newFeed.m_link + ' (old: ' + origFeed.m_link + ')');
      r.needsUpdate = true;
    };
    if (newFeed.m_description != origFeed.m_description)
    {
      // Display shortened strings in the log
      var shortDesc = newFeed.m_description;
      if (shortDesc == null)
        shortDesc = '[null]'
      if (shortDesc.length > 80)
        shortDesc = shortDesc.substring(0, 80) + '...';
      var shortOldDesc = origFeed.m_description;
      if (shortOldDesc == null)
        shortOldDesc = '[none]'
      else if (shortOldDesc.length > 80)
        shortOldDesc = shortOldDesc.substring(0, 80) + '...';
      log.info('db: new description: ' + shortDesc + ' ' +
                  '(old: ' + shortOldDesc + ')');

      r.needsUpdate = true;
    };
    if (newFeed.m_rss_type != origFeed.m_rss_type)
    {
      log.info('db: new rss_type: ' + newFeed.m_rss_type + ' ' +
                  '(old: ' + origFeed.m_rss_type + ')');
      r.needsUpdate = true;
    };
    if (newFeed.m_rss_version != origFeed.m_rss_version)
    {
      log.info('db: new rss_version: ' + newFeed.m_rss_version + ' ' +
                  '(old: ' + origFeed.m_rss_version + ')');
      r.needsUpdate = true;
    };
    if (newFeed.m_tags != origFeed.m_tags)
    {
      log.info('db: new tags: ' + newFeed.m_tags + ' ' +
                  '(old: ' + origFeed.m_tags + ')');
      r.needsUpdate = true;
      r.needsRTableSync = true;  // Also update RTable 'rss_subscriptions'
    }
    if (newFeed.m_is_unsubscribed != origFeed.m_is_unsubscribed)
    {
      log.info('db: new is_unsubscribed: ' + newFeed.m_is_unsubscribed + ' ' +
                  '(old: ' + origFeed.m_is_unsubscribed + ')');
      r.needsUpdate = true;
    }
  }

  return r;
}
Feeds.prototype.p_feedNeedsUpdate = p_feedNeedsUpdate;

// object Feeds.p_feedRecord
// Insert a new record or update a record of a feed (RssHeader) in the indexedDB
// Record operation will be ignored at an attempt to record a feed that is already in
// feed -- obj: RSSHeader
// syncRTable -- bool: true if no need to sync with remote table
// cbResult(was_update_needed) -- callback
// was_update_needed -- int: 1 = update was needed and entry was recorded
// was_update_needed -- int: 0 = no update was needed, record request ignored
function p_feedRecord(feed, syncRTable, cbResult)
{
  var self = this;
  // operate on the copy, not on the reference
  utils_ns.assert(feed instanceof feeds_ns.RssHeader, "copyRssHeader: x instanceof feeds_ns.RssHeader");
  var feedUrl = feed.m_url;

  // Insert entry in m_dbSubscriptions
  var tran = self.m_db.transaction(['rss_subscriptions'], 'readwrite');
  tran.oncomplete = function (event)
      {
        log.trace('db: update transaction transaction completed');
      };
  tran.onabort = function (event)
      {
        self.p_feedOnDbError1('write transaction aborted', 'rss_subscriptions', null, cbResult, 0);
      };
  tran.onerror = function (event)
      {
        self.p_feedOnDbError1('write transaction error', 'rss_subscriptions', null, cbResult, 0);
      };
  var store = tran.objectStore('rss_subscriptions');

  feed.m_pending_db = true;
  var m = -1;
  var req = store.get(feed.m_url);
  req.onerror = function(event)
      {
        self.p_feedOnDbError1('read transaction error', 'rss_subscriptions', feedUrl, cbResult, 0);
      };
  req.onabort = function (event)
      {
        self.p_feedOnDbError1('read transaction aborted', 'rss_subscriptions', feedUrl, cbResult, 0);
      };
  req.onsuccess = function(event)
      {
        m = self.p_feedFindByUrl(feedUrl);
        if (m < 0)
        {
          self.p_feedOnDbError1('feed already deleted', 'rss_subscriptions', feedUrl, cbResult, 0);
          return;
        }
        feed = self.m_rssFeeds[m];

        var needsUpdate = false;
        var needsRTableSync = false;

        var data = req.result;
        if (data === undefined)
        {
          needsUpdate = true;  // entry is not in the DB
          if (syncRTable)
            needsRTableSync = true;  // Also update RTable 'rss_subscriptions'
        }
        else
        {
          // Check if the record in the DB needs updating
          var r = p_feedNeedsUpdate(feed, data, !syncRTable);
          needsUpdate = r.needsUpdate;
          needsRTableSync = r.needsRTableSync;
        };

        if (needsRTableSync)
        {
          self.p_rtableSyncFeedEntry(feed);  // new url or tags
          utils_ns.assert(feed.m_remote_state != feeds_ns.RssSyncState.IS_LOCAL_ONLY, "p_feedRecord: remote state");
        }

        if (!needsUpdate)
        {
          feed.m_pending_db = true;
          if (cbResult != null)  // Notifier callback provided?
            cbResult(0);  // Notify that no update was needed
          return;
        }

        var reqAdd = store.put(utils_ns.marshal(feed, 'm_'));
        reqAdd.onsuccess = function(event)
            {
              var data = reqAdd.result;
              log.info('db: added! [' + feed.m_url + ']');
              feed.m_pending_db = true;
              if (cbResult != null)  // Notifier callback provided?
                cbResult(1);  // Notify that update was needed and entry was recorded
            }
        reqAdd.onerror = function(event)
            {
              // cbResult: Notify that update was needed followed by an error
              self.p_feedOnDbError1('write error msg: ' + reqAdd.error.message + ' url: ' + feed.m_url,
                                   'rss_subscriptions', feed.m_url, cbResult, 2);
            }
      } // req.onsuccess()
}
Feeds.prototype.p_feedRecord = p_feedRecord;

// object Feeds.p_feedAddByUrl
// add a new feed (by URL) to list of feeds
function p_feedAddByUrl(feedUrl, tags, cbDone, updateRemote)
{
  var self = this;
  var newFeed = new feeds_ns.RssHeader(feedUrl /*url*/, feedUrl /*title*/,
                    null /*link*/, null /*description*/,
                    null /*language*/, null /*updated*/);
  newFeed.m_tags = tags;

  // Put into local list of RSS subscriptions (self.m_rssFeeds)
  self.p_feedInsert(newFeed);

  // Add to IndexedDB table rss_subscriptions
  // Add to remote table 'rss_subscriptions' (if updateRemote)
  self.p_feedRecord(newFeed, updateRemote, null);

  // First fetch of the RSS data for this URL, update the subscribed listeners
  self.p_fetchRss(feedUrl, null,
      function()  // CB: write operation is completed
      {
        if (cbDone != null)
          cbDone();
      });
}
Feeds.prototype.p_feedAddByUrl = p_feedAddByUrl;

// object Feeds.feedAddByUrl
// add a new feed (by URL) to list of feeds
function feedAddByUrl(feedUrl, tags, cbDone)
{
  let self = this;

  self.p_feedAddByUrl(feedUrl, tags, cbDone, true);
}
Feeds.prototype.feedAddByUrl = feedAddByUrl;

// object Feeds.feedAddByUrl1
// [Debug function]
// Add a new example feed (by URL) to list of feeds
function feedAddByUrl1()
{
  let self = this;

  self.p_feedAddByUrl('http://www.npr.org/rss/rss.php?id=1034', '', null, false);
  log.info('[Debug] Added http://www.npr.org/rss/rss.php?id=1034');
}
Feeds.prototype.feedAddByUrl1 = feedAddByUrl1;

// object Feeds.feedAddByUrl2
// [Debug function]
// Add a new example feed (by URL) to list of feeds
function feedAddByUrl2()
{
  let self = this;

  self.p_feedAddByUrl('https://lareviewofbooks.org/feed/?ver=2', '', null, false);
  log.info('[Debug] Added https://lareviewofbooks.org/feed/?ver=2');
}
Feeds.prototype.feedAddByUrl2 = feedAddByUrl2;

// object Feeds.p_feedRemoveDB
// Deletes a feed from database table 'rss_subscriptions'
function p_feedRemoveDB(feedUrl, needsRTableSync)
{
  var self = this;

  // Find entry in m_dbSubscriptions
  var tran = self.m_db.transaction(['rss_subscriptions'], 'readwrite');
  self.p_dbSetTranErrorLogging(tran, 'rss_subscriptions', 'delete');
  var store = tran.objectStore('rss_subscriptions');

  // IndexedDB documentation states that direct call to
  // store.delete(key) should work. But on Google Chrome if the key is
  // invalid we still get onsuccess().
  // Workaround: confirm that the record exists first
  var req = store.get(feedUrl);
  var req2 = null;
  req.onsuccess = function(event)
      {
        var data = req.result;
        if (data === undefined)
        {
          log.error('db: delete request error, record not found for ' + feedUrl);
          return;
        }
        if (needsRTableSync)
        {
          // If this entry was ever synched to remote table, then delete it from remote table
          if (data.m_remote_state == feeds_ns.RssSyncState.IS_SYNCED)
          {
            log.info('p_feedRemoveDB: delete from remote table, feed: ' + feedUrl);
            self.m_rtGDrive.deleteRec(self.m_remote_subscriptions_id, data.m_hash);  // delete by hash of feed url
          }
        }
        else
        {
            log.info('p_feedRemoveDB: sync to remote not reqested for: ' + feedUrl);
        }

        // Record exists, delete it
        req2 = store.delete(feedUrl);
        req2.onsuccess = function(event)
            {
              log.info('db: delete request success, feed: ' + feedUrl);

              var f = feeds_ns.emptyRssHeader();
              f.m_url = feedUrl;
              var listRemoved = [];
              listRemoved.push(f);
              self.m_feedsCB.onRssRemoved(listRemoved);
            }
        req2.onerror = function(event)
            {
              log.error('db: delete request error2 for ' + req2.result.m_url);
            }
      }
  req.onerror = function(event)
      {
        log.error('db: delete request error1 for ' + req.result.m_url);
      }
}
Feeds.prototype.p_feedRemoveDB = p_feedRemoveDB;

// object Feeds.p_feedRemoveList
// Deletes a list of feeds from database table 'rss_subscriptions'
function p_feedRemoveList(listToRemove, needsRTableSync)
{
  var self = this;

  var i = 0;
  var hdr = null;
  for (i = 0; i < listToRemove.length; ++i)
  {
    hdr = listToRemove[i];
    utils_ns.assert(hdr instanceof feeds_ns.RssHeader, "p_feedRemoveList: x instanceof feeds_ns.RssHeader");

    log.info('execute deferred remove: ' + hdr.m_url);
    self.p_feedRemoveDB(hdr.m_url, needsRTableSync);
  }
}
Feeds.prototype.p_feedRemoveList = p_feedRemoveList;

// object Feeds.p_feedRemove
// Deletes a feed from database table 'rss_subscriptions' and list of feeds
function p_feedRemove(feedUrl, needsRTableSync)
{
  var self = this;

  // Find feed in the list of feeds
  var feed = feeds_ns.emptyRssHeader();
  feed.m_url = feedUrl;
  var m = self.m_rssFeeds.binarySearch(feed, compareRssHeadersByUrl);
  if (m < 0)
  {
    log.error('rss feed ' + feedUrl + ' not found');
    return;
  }

  // Remove from list of feeds
  self.m_rssFeeds.splice(m, 1);

  // Delete from the database
  var kk = [];
  kk.push(feed);
  self.p_feedRemoveList(kk, needsRTableSync);
}
Feeds.prototype.p_feedRemove = p_feedRemove;

// object Feeds.feedRemove
// Deletes a feed from database table 'rss_subscriptions' and list of feeds
function feedRemove(feedUrl)
{
  var self = this;
  self.p_feedRemove(feedUrl, true);
}
Feeds.prototype.feedRemove = feedRemove;

// object Feeds.feedUnsubscribeAll
// [Debug function]
// Deletes all feeds from database table 'rss_subscriptions' and list of feeds
//
// To call for from the console:
// feeds_ns.app.m_feedsDir.m_feedsDB.feedUnsubscribeAll
function feedUnsubscribeAll()
{
  var self = this;

  log.info('[Debug] Delete all subscriptions from IndexedDB...');

  let num_subs = self.m_rssFeeds.length;
  // Remove local feeds, without remote sync
  while (self.m_rssFeeds.length > 0)
    self.p_feedRemove(self.m_rssFeeds[0].m_url, false)

  log.info('[Debug] Done, deleted ' + num_subs + ' RSS subsciptions');
}
Feeds.prototype.feedUnsubscribeAll = feedUnsubscribeAll;

// object Feeds.feedResetRTableConnection
// [Debug function]
// Resets connection to remote table 'rss_subscriptions', upon restart
// the App will do a full re-load of the remote table
//
// To call for from the console:
// feeds_ns.app.m_feedsDir.m_feedsDB.feedResetRTableConnection
function feedResetRTableConnection()
{
  var self = this;

  self.m_rt.reset('rss_subscriptions');
}
Feeds.prototype.feedResetRTableConnection = feedResetRTableConnection;

// object Feeds.feedMarkUnsubscribed
// Marks a feed as unsubscribed (permits undo)
function feedMarkUnsubscribed(feedUrl, isUnsubscribed)
{
  var self = this;

  // Search for feed f
  var f = feeds_ns.emptyRssHeader();
  f.m_url = feedUrl;

  // find if a feed with this URL is already in m_rssFeeds[]
  var index = self.m_rssFeeds.binarySearch(f, compareRssHeadersByUrl);
  if (index < 0)
  {
    log.warn('Feeds.update: error, ' + f.m_url + ' is unknown');
    return;
  };
  var target = feeds_ns.copyRssHeader(self.m_rssFeeds[index]);

  target.m_is_unsubscribed = isUnsubscribed;

  var flagUpdatedHeader = self.p_feedUpdateHeader(index, target);
  if (flagUpdatedHeader)  // Record any changes in IndexedDB
    self.p_feedRecord(target, true, null);
}
Feeds.prototype.feedMarkUnsubscribed = feedMarkUnsubscribed;

// object Feeds.feedSetTags
// Sets the tags field of a RSSHeader
// returns error code:
// 0 -- no error
// 1 -- feed with this URL doesn't exist in the list of feeds
function feedSetTags(feedUrl, tags)
{
  var self = this;

  // Find insertion point into the sorted m_rssFeeds[]
  var m = self.p_feedFindByUrl(feedUrl);
  if (m < 0)  // Entry with this url doesn't exist
    return 1;

  var targetFeed = self.m_rssFeeds[m];
  targetFeed.m_tags = tags;

  // Notify event subscribers
  var updated = new Array();
  updated.push(targetFeed);
  self.m_feedsCB.onRssUpdated(updated);

  // Update the database record (IndexedDb) and remote table 'rss_subscriptions'
  self.p_feedRecord(targetFeed, true, null);
  return 0;
}
Feeds.prototype.feedSetTags = feedSetTags;

// object Feeds.feedDumpEntries
// debug feed print
function feedDumpEntries(feed)
{
  var self = this;
  var i = 0;
  var keys = Object.keys(feed.x_items);

  for (i = 0; i < keys.length; ++i)
  {
    var t = feed.x_items[keys[i]];
    var x = t.m_date;

    var d = i + ': ' + utils_ns.dateToStr(x);
    log.info(d);
    d = i + ': ' + t.m_link;
    log.info(d);
    if (false)
    {
      d = i + ': ' + t.m_hash;
      log.info(d);
      d = i + ': ' + t.m_title;
      log.info(d);
    }
    if (false)
    {
      d = i + ': ' + t.m_description;
      log.info(d);
    }
  }
  log.info('total of ' + keys.length + ' items');
}
Feeds.prototype.feedDumpEntries = feedDumpEntries;

// object Feeds.p_feedRecordEntry
// Records an RSS entry into the IndexedDB 'rss_data'
// Write operation is invoked only if the entry with this key is not
// already stored
function p_feedRecordEntry(feedUrl, newEntry, cbWriteDone)
{
  var self = this;

  // Compute the key for m_rssurl_date
  var sha1 = CryptoJS.SHA1(feedUrl);
  newEntry.m_rssurl_date = sha1.toString() + "_" + utils_ns.dateToStrStrict(newEntry.m_date);

  var newEntry2 = feeds_ns.copyRssEntry(newEntry);
  var s = self.m_rss_entry_cnt;

  // Insert entry in table 'rss_data'
  var tran = self.m_db.transaction(['rss_data'], 'readwrite');
  self.p_dbSetTranErrorLogging(tran, 'rss_data', 'update.1');
  var store = tran.objectStore('rss_data');
  log.trace('db check for hash (' + self.m_rss_entry_cnt + '): ' + newEntry2.m_hash);
  var req = store.get(newEntry2.m_hash);
  ++self.m_rss_entry_cnt;
  req.onsuccess = function(event)
      {
        var data = req.result;
        var needsWrite = false;
        var isRead = false;  // Could be set to read if it already had been read remotely
        if (data === undefined)
          needsWrite = true;
        else if (data.m_remote_state == feeds_ns.RssSyncState.IS_REMOTE_ONLY)
        {
          log.info('db: found IS_REMOTE_ONLY (' + s + '): [' + newEntry2.m_link + ']');
          log.info('db: (' + s + '): m_is_read = ' + data.m_is_read);
          log.info('db: write entry (' + s + '): [' + newEntry2.m_link + ']');
          needsWrite = true;
          newEntry2.m_is_read = data.m_is_read;
          newEntry2.m_remote_state = feeds_ns.RssSyncState.IS_SYNCED;
          isRead = data.m_is_read;
        }
        if (needsWrite)
        {
          log.trace('db: write entry (' + s + '): [' + newEntry2.m_link + ']');

          // Sanitize
          newEntry2.m_description = Sanitizer.sanitize(newEntry2.m_description, function (s)
              {
                // A naive URL rewriter
                log.trace('sanitizer URL: ' + s);
                return s;
              });

          var reqAdd = store.put(utils_ns.marshal(newEntry2, 'm_'));
          reqAdd.onsuccess = function(event)
              {
                var data = reqAdd.result;
                log.trace('db: entry (' + s + ') added: [' + newEntry2.m_link + ']');
                cbWriteDone(0, isRead);
              }
          reqAdd.onerror = function(event)
              {
                log.error('db: entry (' + s + ') error [' + newEntry2.m_link + ']');
                log.error('db: entry (' + s + ') error msg: ' + reqAdd.error.message);
                cbWriteDone(1, isRead);
              }
        }
        else
        {
           cbWriteDone(3, isRead);
          //log.info('db: entry (' + s + ') already in [' + newEntry2.m_link + ']');
        }
      }
}
Feeds.prototype.p_feedRecordEntry = p_feedRecordEntry;

// object Feeds.feedUpdateEntry
// Updates an entry in the IndexedDB
// 1. Reads the entry
// 2. Calls cbUpdate() which can change some of the entry fields
// 3. Records the entry in the IndexedDB
function feedUpdateEntry(entryHash, cbUpdate)
{
  var self = this;

  var s = self.m_rss_entry_cnt;

  // Entry goes into table 'rss_data'
  var tran = self.m_db.transaction(['rss_data'], 'readwrite');
  self.p_dbSetTranErrorLogging(tran, 'rss_data', 'update.2');
  var store = tran.objectStore('rss_data');
  log.trace('db: check for hash (' + self.m_rss_entry_cnt + '): ' + entryHash);
  var req = store.get(entryHash);
  ++self.m_rss_entry_cnt;
  req.onsuccess = function(event)
      {
        var data = req.result;
        var newEntry = null;
        var shouldWrite = false;
        var c = 0;

        if (data === undefined)
        {
          log.info('db: update entry (' + s + '): [' + entryHash + '], not found');

          // Record with this hash is not in the DB
          // Then create a new empty entry and ask cbUpdate() what to do
          newEntry = feeds_ns.emptyRssEntry();
          c = cbUpdate(1, newEntry);
        }
        else
        {
          // Ask for updated data
          newEntry = feeds_ns.copyRssEntry(data);
          c = cbUpdate(0, newEntry);
        }

        if (c != 0)
        {
          log.trace('db: entry (' + s + ') no update needed: [' + newEntry.m_link + ']');
          return;
        }

        var reqAdd = store.put(utils_ns.marshal(newEntry, 'm_'));
        reqAdd.onsuccess = function(event)
            {
              var data = reqAdd.result;
              log.trace('db: entry (' + s + ') updated: [' + newEntry.m_link + ']');
            }
        reqAdd.onerror = function(event)
            {
              log.error('db: entry (' + s + ') error [' + newEntry.m_link + ']');
              log.error('db: entry (' + s + ') error msg: ' + reqAdd.error.message);
            }
      }
}
Feeds.prototype.feedUpdateEntry = feedUpdateEntry;

// object Feeds.markEntryAsRead
// Mark entry as read in the local DB
// Send update to remote DB
function markEntryAsRead(entryHash, isRead)
{
  var self = this;

  self.feedUpdateEntry(entryHash,
      function(state, dbEntry)
      {
        if (state == 0)
        {
          utils_ns.assert(dbEntry.m_hash == entryHash, 'markAsRead: bad data');

          if (dbEntry.m_is_read == isRead)  // Already in the state it needs to be?
            return 1;  // Don't record in the DB
          else
          {
            dbEntry.m_is_read = isRead;
            self.p_rtableSyncEntryRead(dbEntry);
            return 0;  // Record in the DB
          }
        }
        else if (state == 1)
        {
          log.error('db: update entry (' + s + '): [' + entryHash + '], error not found');
          return 1;  // Don't record in the DB
        }
      });
}
Feeds.prototype.markEntryAsRead = markEntryAsRead;

// object Feeds.updateEntriesAll
// Walk over all records for RSS entries (table: rss_data), apply any
// changed from a cbUpdate() callback.
function updateEntriesAll(cbUpdate)
{
  var self = this;

  log.info('db: update all...');
  // Insert entry in m_dbSubscriptions
  var tran = self.m_db.transaction(['rss_data'], 'readwrite');
  self.p_dbSetTranErrorLogging(tran, 'rss_data', 'update.3');
  var store = tran.objectStore('rss_data');
  var cursor = store.openCursor();  // navigate all entries
  cursor.onsuccess = function(event)
      {
        var req = null;

        var cursor = event.target.result;
        if (!cursor)
        {
          cbUpdate(null);  // Tell the callback we are done
          return;
        }

        var entry = cursor.value;

        // Call the update callback for this value
        var r = cbUpdate(cursor.value);
        if (r == 0)
        {
          return;  // done with all entries
        }
        else if (r == 1)  // Write new value and move to the next
        {
          req = cursor.update(cursor.value);
          req.onsuccess = function(event)
              {
                var data = req.result;
                log.info('db: update success: ' + req.result);
              }
          req.onerror = function(event)
              {
                log.error('db: update error msg: ' + req.error.message);
              }
          cursor.continue();
        }
        else if (r == 2)  // Don't write anything, move to the next
        {
          cursor.continue();
        }
      }
}
Feeds.prototype.updateEntriesAll = updateEntriesAll;

// object Feeds.p_timeSinceLastOncePerDay
// Computes time in milliseconds since the last time the "once_per_day" hook was run
function p_timeSinceLastOncePerDay()
{
  var self = this;

  var strDateExpirationCycle = self.prefGet('m_local.feeds.timestamp_last_once_per_day');
  if (strDateExpirationCycle === undefined)
    return -1;  // This preference record is empty, this is the first time

  var timeStampLastCycle = parseInt(strDateExpirationCycle);
  utils_ns.assert(!isNaN(timeStampLastCycle), 'Invalid timestamp: ' + strDateExpirationCycle);

  var now = new Date();
  var elapsedTime = now.getTime() - timeStampLastCycle;

  return elapsedTime;
}
Feeds.prototype.p_timeSinceLastOncePerDay = p_timeSinceLastOncePerDay;

// object Feeds.p_recordTimeOncePerDay
// Records the current time in the key 'm_local.feeds.timestamp_last_once_per_day'
function p_recordTimeOncePerDay()
{
  var self = this;

  var strDate = ((new Date()).getTime()).toString();
  self.prefSet('m_local.feeds.timestamp_last_once_per_day', strDate);
}
Feeds.prototype.p_recordTimeOncePerDay = p_recordTimeOncePerDay;

// object Feeds.p_isTimeForOncePerDay
function p_isTimeForOncePerDay()
{
  var self = this;

  var elapsedTime = self.p_timeSinceLastOncePerDay();
  if (elapsedTime == -1)  // No date was yet recorded, first time call
    return true;

  var msDay = 24 * 60 * 60 * 1000;  // Miliseconds in 24 hours
  if (elapsedTime > msDay)
    return true;
  else
    return false;
}
Feeds.prototype.p_isTimeForOncePerDay = p_isTimeForOncePerDay;

// object Feeds.p_oncePerDay
// If 24h or more have expired since last time it will execute hook "once_per_day"
function p_oncePerDay()
{
  var self = this;

  if (!self.p_isTimeForOncePerDay())
  {
    log.info('p_isTimeForOncePerDay: skip');
    return;
  }

  self.p_recordTimeOncePerDay();

  log.info('Hook "once_per_day"...');

  // Execute hook
  var i = 0;
  for (i = 0; i < self.m_hook_once_per_day.length; ++i)
    self.m_hook_once_per_day[i]()
}
Feeds.prototype.p_oncePerDay = p_oncePerDay;

// object Feeds.p_timeSinceLastDBExpireCycle
// Computes time in milliseconds since the last time the expiration cycle for recoreds was run
function p_timeSinceLastDBExpireCycle()
{
  var self = this;

  var strDateExpirationCycle = self.prefGet('m_local.feeds.expired_db_last_cycle');
  if (strDateExpirationCycle === undefined)
    return -1;  // This preference record is empty, this is the first time

  var timeStampLastCycle = parseInt(strDateExpirationCycle);
  utils_ns.assert(!isNaN(timeStampLastCycle), 'Invalid timestamp: ' + strDateExpirationCycle);

  var now = new Date();
  var elapsedTime = now.getTime() - timeStampLastCycle;

  return elapsedTime;
}
Feeds.prototype.p_timeSinceLastDBExpireCycle = p_timeSinceLastDBExpireCycle;

// object Feeds.p_isTimeToExpireDB
function p_isTimeToExpireDB()
{
  var self = this;

  var elapsedTime = self.p_timeSinceLastDBExpireCycle();
  if (elapsedTime == -1)  // No date was yet recorded, first time call
    return true;

  var msDay = 24 * 60 * 60 * 1000;  // Miliseconds in 24 hours
  if (elapsedTime > msDay)
    return true;
  else
    return false;
}
Feeds.prototype.p_isTimeToExpireDB = p_isTimeToExpireDB;

// object Feeds.p_recordTimeExpireCycle
// Records the current time in the key 'm_local.feeds.expired_db_last_cycle'
function p_recordTimeExpireCycle()
{
  var self = this;

  var strDate = ((new Date()).getTime()).toString();
  self.prefSet('m_local.feeds.expired_db_last_cycle', strDate);
}
Feeds.prototype.p_recordTimeExpireCycle = p_recordTimeExpireCycle;

// object Feeds.p_expireEntries
// Walk over all records for RSS entries (table: rss_data), delete old records
// Keep track of time of last action, don't repeat in intervals less than 24h
function p_expireEntries()
{
  var self = this;

  if (!self.p_isTimeToExpireDB())
  {
    log.info('p_expireEntries: skip');
    return;
  }

  self.p_recordTimeExpireCycle();

  log.info('db: expire older entries...');

  var tran = self.m_db.transaction(['rss_data'], 'readwrite');
  self.p_dbSetTranErrorLogging(tran, 'rss_data', 'expire');
  var store = tran.objectStore('rss_data');
  var cursor = store.openCursor();  // navigate through all the entries
  var totalSizeToExpire = 0;
  var numExpire = 0;
  var numTotal = 0;
  cursor.onsuccess = function(event)
      {
        var req = null;

        var cursor = event.target.result;
        if (!cursor)
        {
          // cbUpdate(null);  // Tell the callback we are done
          self.m_numExpire = numExpire;
          self.m_totalSizeToExpire = totalSizeToExpire;
          log.info('db: expire records, last record');
          log.info('db: expire record, num = ' + numExpire + ' from total = ' + numTotal +
                   ', size = ' + totalSizeToExpire);
          return;
        }

        var entry = cursor.value;

        // Call the update callback for this value
        ++numTotal;
        if (feeds_ns.isTooOldRssEntry(cursor.value))
        {
          // Update counters to display in pane Stats
          ++numExpire;
          totalSizeToExpire += utils_ns.roughSizeOfObject(cursor.value);

          // Delete this record in IndexedDb
          var delReq = cursor.delete();
          delReq.onsuccess = function(event)
              {
                log.info('db: expire records success');
              }
          delReq.onerror = function(event)
              {
                ++self.m_numDeleteErrors;
                log.error('db: expire records error msg: ' + req.error.message);
                log.error("db: ('rss_data', 'delete') error for: " + cursor.m_hash);
                var error_msg = "db: ('rss_data', 'delete') error: " + reqAdd.error.message;
                utils_ns.domError(error_msg);
              }
        }

        cursor.continue();
      }
}
Feeds.prototype.p_expireEntries = p_expireEntries;

// object Feeds.p_entriesCalcSize
// Walk over all records for RSS entries (table: rss_data), compute total size
function p_entriesCalcSize()
{
  var self = this;

  log.info('db: calculate size of all entries...');

  var totalSize = 0;
  var cnt = 0;

  self.feedReadEntriesAll(function(rssEntry)
      {
        if (rssEntry == null)
        {
          log.info('db calc size, total entries: ' + cnt);
          log.info('db calc size, total size: ' + utils_ns.numberWithCommas(totalSize));
          self.m_dbsize = totalSize;
          self.m_numTotal = cnt;
          return 0;
        }
        else
        {
          ++cnt;
          totalSize += utils_ns.roughSizeOfObject(rssEntry);
          return 1;
        }
      });
}
Feeds.prototype.p_entriesCalcSize = p_entriesCalcSize;

// object Feeds.p_feedUpdate
// update fields and entries (type RSSHeader) in m_rssFeeds[] that are new
// cbWriteDone -- called to signal when the write to disk operation is completed
//                (it will be called even if 0 records are updated)
function p_feedUpdate(feedHeaderNew, cbWriteDone)
{
  var self = this;

  // find if a feed with this URL is already in m_rssFeeds[]
  var index = self.m_rssFeeds.binarySearch(feedHeaderNew, compareRssHeadersByUrl);
  if (index < 0)
  {
    log.warn('Feeds.update: error, ' + feedHeaderNew.m_url + ' is unknown');
    if (cbWriteDone != null)
      cbWriteDone();  // Nothing to write, consider operation completed
    return null;
  };
  var target = self.m_rssFeeds[index];

  // Overwrite fields that are meta-data and can't come
  // from the feed's source website
  feedHeaderNew.m_is_unsubscribed = target.m_is_unsubscribed;
  feedHeaderNew.m_tags = target.m_tags;
  feedHeaderNew.m_remote_state = target.m_remote_state;
  feedHeaderNew.x_pending_db = target.x_pending_db;

  // Transfer any accumulated error info during RSS fetching
  target.x_errors = feedHeaderNew.x_errors;
  if (feedHeaderNew.x_errors != null && feedHeaderNew.x_errors.length > 0)
    log.info('p_feedUpdate: error transfered for ' + feedHeaderNew.m_url);

  // Check if any fields of rssFeed header have new values
  var flagUpdatedHeader = self.p_feedUpdateHeader(index, feedHeaderNew);
  if (flagUpdatedHeader)  // Record any changes in IndexedDB and remote table 'rss_subscriptions'
    self.p_feedRecord(feedHeaderNew, true, null);

  // Send each entry in the RSS feed to the database
  // for possible write operation
  var i = 0;
  var keysNew = Object.keys(feedHeaderNew.x_items);
  var keyNew = '';
  var newEntry = null;
  var cntDone = 0;
  var cntFresh = 0;
  var totalCnt = 0;
  var unchangedCnt = 0;
  var requestsDone = false;
  var numSkipped = 0;
  for (i = 0; i < keysNew.length; ++i)
  {
    keyNew = keysNew[i];
    newEntry = feedHeaderNew.x_items[keyNew];

    // Skip it, if entry is too old
    if (feeds_ns.isTooOldRssEntry(newEntry))
    {
      ++numSkipped;
      continue;
    }

    // Record a new entry if not already in the database
    ++cntDone;
    self.p_feedRecordEntry(target.m_url, newEntry,
       function(state, isRead)  // CB: write operation completed
       {
         if (state == 0)  // New entry added to the table 'rss_data'?
         {
           if (!isRead)
             ++cntFresh;
           ++totalCnt;
         }
         if (state == 3)  // Unchanged?
           ++unchangedCnt;

         --cntDone;
         if (requestsDone && cntDone == 0)
         {
           if (cbWriteDone != null)
           {
             if (totalCnt > 0)
               log.info(totalCnt + " new entries recorded in table 'rss_data', " + unchangedCnt + ' unchanged');
             cbWriteDone(totalCnt, cntFresh);
           }
         }
       });
  }
  requestsDone = true;

  // Nothing to write, or all skipped, consider operation done
  if (keysNew.length == 0 || numSkipped == keysNew.length)
  {
    if (cbWriteDone != null)
    {
      log.info("0 new entries recorded in table 'rss_data', 0 unchanged");
      cbWriteDone(totalCnt, cntFresh);
    }
  }

  return target;
}
Feeds.prototype.p_feedUpdate = p_feedUpdate;

// object Feeds.p_feedsUpdateAll
// Walk over all feeds (RssHeaders) from IndexedDB (table: rss_subscriptions),
// apply any changed from a cbUpdate() callback.
function p_feedsUpdateAll(cbUpdate)
{
  var self = this;

  log.info('db: feeds update all...');
  // Insert entry in m_dbSubscriptions
  var tran = self.m_db.transaction(['rss_subscriptions'], 'readwrite');
  self.p_dbSetTranErrorLogging(tran, 'rss_subscriptions', 'update');
  var store = tran.objectStore('rss_subscriptions');
  var cursor = store.openCursor();  // navigate all entries
  cursor.onsuccess = function(event)
      {
        var req = null;

        var cursor = event.target.result;
        if (!cursor)
        {
          cbUpdate(null);  // Tell the callback we are done
          return;
        }

        var entry = cursor.value;

        // Call the update callback for this value
        var r = cbUpdate(cursor.value);
        if (r == 0)
        {
          return;  // done with all entries
        }
        else if (r == 1)  // Write new value and move to the next
        {
          req = cursor.update(cursor.value);
          req.onsuccess = function(event)
              {
                var data = req.result;
                log.info('db: update success: ' + req.result);
              }
          req.onerror = function(event)
              {
                log.error('db: update error msg: ' + req.error.message);
              }
          cursor.continue();
        }
        else if (r == 2)  // Don't write anything, move to the next
        {
          cursor.continue();
        }
      }
}
Feeds.prototype.p_feedsUpdateAll = p_feedsUpdateAll;

// object Feeds.feedReadEntriesAll
// Reads from the database, all entries (flat)
// 1. Read until cbFilter returns 0
function feedReadEntriesAll(cbFilter)
{
  var self = this;

  log.info('db: read all...');
  // Insert entry in m_dbSubscriptions
  var tran = self.m_db.transaction(['rss_data'], 'readonly');
  self.p_dbSetTranErrorLogging(tran, 'rss_data', 'read.1');
  var store = tran.objectStore('rss_data');
  var cursor = store.openCursor();  // navigate all entries
  cursor.onsuccess = function(event)
      {
        var cursor = event.target.result;
        if (!cursor)
        {
          cbFilter(null);
          return;  // done with all entries
        }

        var entry = cursor.value;

        // Call the filter callback for this value
        var r = cbFilter(entry);
        if (r == 0)
        {
          return;  // done with all entries
        }

        cursor.continue();
      }
}
Feeds.prototype.feedReadEntriesAll = feedReadEntriesAll;

// object Feeds.feedReadEntries
// Reads from the database:
// 1. starting from _starTime_
// 2. read until cbFilter returns 0
function feedReadEntries(feedUrl, startTime, isDescending, cbFilter)
{
  var self = this;

  log.info('db: read for ' + feedUrl + '...');
  // Compute the key for rssurl_date based on url + startTime
  var sha1 = CryptoJS.SHA1(feedUrl);
  log.trace(utils_ns.dateToStrStrict(new Date(0)));
  log.trace(utils_ns.dateToStrStrict(startTime));
  var sha1Url = sha1.toString();

  // Insert entry in m_dbSubscriptions
  var tran = self.m_db.transaction(['rss_data'], 'readonly');
  self.p_dbSetTranErrorLogging(tran, 'rss_data', 'read.2');
  var store = tran.objectStore('rss_data');
  var index = store.index('rssurl_date');
  var key_rssurl_curdate = null;
  var key_rssurl_oldestdate = null;
  var key_rssurl_newestdate = null;
  var range = null;
  var cursor = null;
  if (isDescending)
  {
    key_rssurl_curdate = sha1.toString() + "_" + utils_ns.dateToStrStrict(startTime);
    key_rssurl_oldestdate = sha1.toString() + "_" + utils_ns.dateToStrStrict(new Date(0));
    range = IDBKeyRange.bound(key_rssurl_oldestdate, key_rssurl_curdate);
    cursor = index.openCursor(range, 'prev');  // navigate in descending order of startTime
  }
  else
  {
    key_rssurl_curdate = sha1.toString() + "_" + utils_ns.dateToStrStrict(startTime);
    key_rssurl_newestdate = sha1.toString() + "_" + utils_ns.dateToStrStrict(new Date());
    range = IDBKeyRange.bound(key_rssurl_curdate, key_rssurl_newestdate);
    cursor = index.openCursor(range, 'next');  // navigate in ascending order of startTime
  }
  var entries = [];
  cursor.onsuccess = function(event)
      {
        var cursor = event.target.result;
        if (!cursor)
        {
          cbFilter(null);
          return;  // done with all entries
        }

        var entry = cursor.value;

        // Call the filter callback for this value
        var r = cbFilter(entry);
        if (r == 0)
        {
          return;  // done with all entries
        }

        // Check if the URL portion of the hash matches
        var h = entry.m_rssurl_date.indexOf('_');
        var m_rssurl = entry.m_rssurl_date.slice(0, h);
        if (m_rssurl != sha1Url)
        {
          // This should never happen
          // Just an extra verification of db results
          log.error('db: not the key we need');
          cbFilter(null);
        }

        cursor.continue();
      }
}
Feeds.prototype.feedReadEntries = feedReadEntries;

// object Feeds.feedGetList
// return a list of all feeds
function feedGetList()
{
  var self = this;

  var feedsList = new Array();

  var i = 0;
  for(i = 0; i < self.m_rssFeeds.length; ++i)
    feedsList.push(self.m_rssFeeds[i]);

  return feedsList;
}
Feeds.prototype.feedGetList = feedGetList;

// object Feeds.feedListSearch
// Finds if entry with certain feed URL is in the list
// (Performs a binary search)
// Returns: index in the list, negative = not found
function feedListSearch(feedUrl)
{
  var self = this;

  var targetFeed = feeds_ns.emptyRssHeader();
  targetFeed.m_url = feedUrl;

  // Find point into the sorted m_rssFeeds[]
  var m = self.m_rssFeeds.binarySearch(targetFeed, compareRssHeadersByUrl);
  return m;
}
Feeds.prototype.feedListSearch = feedListSearch;

// object Feeds.feedGetTagsList
// return a list of all tags on feeds
function feedGetTagsList()
{
  var self = this;

  var tagsList = new Array();

  var i = 0;
  var j = 0;
  var tag = '';
  var found = false;
  // Iterate through all rssFeeds
  for (i = 0; i < self.m_rssFeeds.length; ++i)
  {
    tag = self.m_rssFeeds[i].m_tags;
    if (tag == null || tag == '')
      continue;

    // Check if thsi tag is not already in the list
    found = false;
    for (j = 0; j < tagsList.length; ++j)
    {
      if (tag == tagsList[j])
      {
        found = true;
        break;
      }
    }

    if (!found)
      tagsList.push(tag);
  }

  return tagsList;
}
Feeds.prototype.feedGetTagsList = feedGetTagsList;

// object Feeds.p_feedUpdateHeader
// update header of a feed with data from a new updated feed
function p_feedUpdateHeader(toUpdate, updated)
{
  var self = this;
  var target = self.m_rssFeeds[toUpdate];
  var wasUpdated = false;

  if (updated.m_title != target.m_title)
  {
    log.info('new title: ' + updated.m_title + ' (old: ' + target.m_title + ')');
    target.m_title = updated.m_title;
    wasUpdated = true;
  };
  if (updated.m_link != target.m_link)
  {
    log.info('new link: ' + updated.m_link + ' (old: ' + target.m_link + ')');
    target.m_link = updated.m_link;
    wasUpdated = true;
  };
  if (updated.m_description != target.m_description)
  {
    // Display shortened strings in the log
    var shortDesc = updated.m_description;
    if (shortDesc == null)
      shortDesc = '[none]';
    if (shortDesc.length > 80)
      shortDesc = shortDesc.substring(0, 80) + '...';
    var shortOldDesc = target.m_description;
    if (shortOldDesc == null)
      shortOldDesc = '[none]'
    else if (shortOldDesc.length > 80)
      shortOldDesc = shortOldDesc.substring(0, 80) + '...';
    log.info('new description: ' + shortDesc + ' ' +
                '(old: ' + shortOldDesc + ')');

    target.m_description = updated.m_description;
    wasUpdated = true;
  };
  if (updated.m_rss_type != target.m_rss_type)
  {
    log.info('new rss_type: ' + updated.m_rss_type + ' ' +
                '(old: ' + target.m_rss_type + ')');
    target.m_rss_type = updated.m_rss_type;
    wasUpdated = true;
  };
  if (updated.m_rss_version != target.m_rss_version)
  {
    log.info('new rss_version: ' + updated.m_rss_version + ' ' +
                '(old: ' + target.m_rss_version + ')');
    target.m_rss_version = updated.m_rss_version;
    wasUpdated = true;
  };
  if (target.m_date != null)
  {
    // Some feeds reported m_date without in fact changing any of the feed's items
    // Ignore this for now
    if (false)
    {
      if (updated.m_date.getTime() != target.m_date.getTime())
      {
        log.info('new updated: ' + updated.m_date + ' ' +
                    '(old: ' + target.m_date + ')');
        target.m_date = updated.m_date;
        wasUpdated = true;
      }
    }
  }
  else
  {
    // First time Date is set in feeld m_date
    log.info('new updated: ' + updated.m_date + ' ' +
                '(old: ' + target.m_date + ')');
    target.m_date = updated.m_date;
    wasUpdated = true;
  }
  if (updated.m_is_unsubscribed != target.m_is_unsubscribed)
  {
    log.info('new is_unsubscribed: ' + updated.m_is_unsubscribed + ' ' +
                '(old: ' + target.m_is_unsubscribed + ')');
    target.m_is_unsubscribed = updated.m_is_unsubscribed;
    wasUpdated = true;
  }

  return wasUpdated;
}
Feeds.prototype.p_feedUpdateHeader = p_feedUpdateHeader;

// object Feeds.p_fetchRss
// Fetch an RSS feed by its url, process it and call the done callback,
// and after that the callback for write completed
function p_fetchRss(urlRss, cbDone, cbWriteDone)
{
  var self = this;

  feeds_ns.fetchRss(urlRss,
      function(c, feed, errorMsg)
      {
        if (c == 0)
          log.trace('rss fetch, success: ' + feed.m_url);
        else  // Network error
        {
          var shortMsg = errorMsg.substring(0, 80) + '...';
          log.warn('rss fetch, failed: ' + shortMsg + ', for: ' + feed.m_url);
        }

        var target = self.p_feedUpdate(feed,
            function(numNewEntries, numFreshEntries)  // CB: write operation completed
            {
              if (numNewEntries > 0)
              {
                log.trace(urlRss + ': ' + numNewEntries + ' new entries, ' +
                          numFreshEntries + ' fresh entries');
              }
              // This CB is useful for when a newly added feed needs
              // to be displayed for the first time, it relies on
              // the fact that the data is already in the IndexedDB
              if (cbWriteDone != null)
                cbWriteDone(numNewEntries, numFreshEntries);
            });
        if (target != null)
        {
          // Notify event subscribers
          var updated = new Array();
          updated.push(target);
          self.m_feedsCB.onRssUpdated(updated);
        }
        else
          log.warn('p_fetchRss: target is null');

        if (cbDone != null)
          cbDone();
      });
}
Feeds.prototype.p_fetchRss = p_fetchRss;

// object Feeds.suspendFetchLoop
// This is the method to start or cancel the fetch loop
// Set the delay before next iteration of the poll loop
function suspendFetchLoop(flag, fetchWhen)
{
  var self = this;

  if (flag)
  {
    self.m_loopIsSuspended = true;
    self.m_feedsCB.onRssFetchProgress(-1); // In case there was any progress indicator on display
    log.info('fatch loop SUSPENDED');
  }
  else
  {
    log.info('fatch loop RESUMED, ' + fetchWhen);

    // Reset crawler index of the fetch loop
    self.m_pollIndex = 0;

    self.m_loopIsSuspended = false;
    if (fetchWhen >= 0)
      self.p_reschedulePoll(fetchWhen);
  }
}
Feeds.prototype.suspendFetchLoop = suspendFetchLoop;

// object Feeds.p_reschedulePoll
// Set the delay before next iteration of the poll loop
function p_reschedulePoll(delayInSeconds)
{
  var self = this;

  // Clear any previously set timeout
  if (self.m_timeoutID != null)
    clearTimeout(self.m_timeoutID);

  var delay = delayInSeconds * 1000;
  self.m_timeoutID = setTimeout(p_poll, delay, self);
}
Feeds.prototype.p_reschedulePoll = p_reschedulePoll;

// object FetchEntryDescriptor [constructor]
// Describes one entry in the list of fetch order of rss entries
function FetchEntryDescriptor(url, folder, notify)
{
  this.m_url = url;
  this.m_folder = folder;  // Folder to which a feed belongs or 'null'
  this.m_notify = notify;
  this.m_updated = false;  // Records if new entries are fetched for this feed URL
  this.m_title = null;  // Title is set if entry has a title

  return this;
}
Feeds.prototype.FetchEntryDescriptor = FetchEntryDescriptor;

// object Feeds.p_poll
// fetch loop
// schedule new fetch operation at the end of the previous
function p_poll(self)
{
  if (self.m_rssFeeds.length == 0)
  {
    log.info(utils_ns.dateToStr(new Date()) +
                ' the feeds list is empty -- poll loop completed, wait...');
    self.p_reschedulePoll(self.m_pollIntervalSec);
    return;
  }

  if (self.m_loopIsSuspended)
  {
    self.p_reschedulePoll(self.m_pollIntervalSec);
    return;
  }

  if (self.m_pollIndex == 0)  // progress 0%
  {
    self.m_feedsCB.onRssFetchProgress(0);
    // Begin by obtaining fetch order
    //
    // It matches the sort order by which folders and feeds are
    // displayed to the user. This way notifications can be displayed
    // for fresh feeds data as soon as folder/feed is completed
    self.m_fetchOrder = self.m_feedsCB.getFetchOrder();

    //
    // This is a good opportunity to check if it is time for
    // the hook "once_per_day"
    self.p_oncePerDay();
  }

  // Some unsubscriptions might have take place in the interim
  if (self.m_pollIndex >= self.m_fetchOrder.length)
  {
    self.m_feedsCB.onRssFetchProgress(100);  // progress 100%
    self.m_pollIndex = 0;
    self.p_reschedulePoll(self.m_pollIntervalSec);
    return;
  }

  var index = self.m_pollIndex;
  var urlRss = self.m_fetchOrder[index].m_url;
  log.info('fetch: ' + self.m_pollIndex + ' url: ' + urlRss);
  ++self.m_pollIndex;

  var i = 0;
  self.p_fetchRss(urlRss, function ()  // cbDone
      {
        // Update progress indicator
        self.m_feedsCB.onRssFetchProgress((self.m_pollIndex / self.m_fetchOrder.length) * 100);

        // Schedule next fetch operation
        var delay = 0;  // Don't wait in fetching the next feed
        if (self.m_pollIndex >= self.m_fetchOrder.length)
        {
          // Reached the end of the poll loop
          self.m_pollIndex = 0;
          delay = self.m_pollIntervalSec;
          log.info(utils_ns.dateToStr(new Date()) + ' -- poll loop completed, wait...');
          self.m_feedsCB.onRssFetchProgress(100);  // progress 100%
          // Execute hook for completion of polling loop
          for (i = 0; i < self.m_hook_feed_poll_completed.length; ++i)
            self.m_hook_feed_poll_completed[i]()
        }
        self.p_reschedulePoll(delay);
      },
      function (numNewEntries, numFreshEntries)  // cbWriteDone
      {
        // Register if the fetch operation has brought in new entries
        if (numFreshEntries > 0)
          self.m_fetchOrder[index].m_updated = true;

        // See if notification is needed
        if (self.m_fetchOrder[index].m_notify)
          self.m_feedsCB.onRssNotifyFresh(self.m_fetchOrder[index]);
      });
}
Feeds.prototype.p_poll = p_poll;

// Export functions global to the name space
feeds_ns.compareRssHeadersByUrl = compareRssHeadersByUrl;

// export to feeds_ns namespace
feeds_ns.Feeds = Feeds;
})();
