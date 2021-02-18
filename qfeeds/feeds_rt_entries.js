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

// export to feeds_rt_entries_ns namespace
feeds_rt_entries_ns.rtHandlerEntries = rtHandlerEntries;
})();
