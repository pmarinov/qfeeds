// rtable_dbox.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Remotely synced hash table
// Use Dropbox as a cloud store
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
{
  feeds_ns = {};
}

(function ()
{

"use strict";

// Handle to Dropbox's datastore
var g_datastore = null;

// List of all the RTables created. It is used for when connection to
// Dropbox is restored, or established. At that point the bulk of
// uncommitted data is sent.
var allTables = [];

// object RTableDBox.RTableDBox [constructor]
function RTableDBox()
{
  var self = this;

  self.m_table = new Object;

  allTables.push(self);
  return self;
}

function hasKey(k)
{
  if (this.m_table[k] === undefined)
    return false;
  else
    return true;
}
RTableDBox.prototype.hasKey = hasKey;

function add(k, v)
{
  // marshal all fields of v into a temp object
  var i = 0;
  var fields = Object.keys(v);
  for (i = 0; i < fields.length; ++i)
  {
    console.log(fields[i] + ":");
  }
  this.m_table[k] = v;
}
RTableDBox.prototype.add = add;

function get(k, v)
{
  return this.m_table[k];
}
RTableDBox.prototype.get = get;

function RTableInit(dboxClient, cbReady)
{
  var datastoreManager = dboxClient.getDatastoreManager();
  datastoreManager.openDefaultDatastore(function (error, datastore)
      {
        if (error)
        {
            alert('Error opening default datastore: ' + error);
            cbReady(1);
        }
        else
        {
            g_datastore = datastore;
            cbReady(0);
        }
      });
}

feeds_ns.RTableDBox = RTableDBox;
feeds_ns.RTableInit = RTableInit;
})();
