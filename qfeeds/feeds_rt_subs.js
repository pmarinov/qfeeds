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

// export to feeds_rt_subs_ns namespace
feeds_rt_subs_ns.rtHandlerSubs = rtHandlerSubs;
})();
