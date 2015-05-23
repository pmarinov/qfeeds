// rtable_gdrive.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Use Google Drive as a cloud store
// Implementation of an interface for accessing remote tables (RTable)
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
{
  feeds_ns = {};
}

(function ()
{

"use strict";

// object RTableGDrive.RTableGDrive [constructor]
// Used for access of remote table stored in Dropbox
// _fields_ is the list of all fields of objects inserted in the table
// _key_ name of primary key, used as Dropbox ID
// Set _key_ to '' to activate automatically generated IDs by Dropbox
function RTableGDrive(name, fields, key)
{
  var self = this;

  // Record status for listeners
  self.RECORD_UPDATED = 1;
  self.RECORD_DELETED = 2;
  self.RECORD_LOCAL = 3;  // feedback from local RTable.insert/delete actions
  return self;
}

// object RTableGDrive.insert
// Records an entry into the remote table
// Updates if remoteId != ''
// Inserts if remoteId == '', returns remoteId of the new record
function insert(entry, remoteId)
{
}
RTableGDrive.prototype.insert = insert;

// object RTableGDrive.readAll
function readAll()
{
  var self = this;

  return self.m_table.query();
}
RTableGDrive.prototype.readAll = readAll;

// object RTableGDrive.deleteAll
function deleteAll()
{
  var self = this;
}
RTableGDrive.prototype.deleteAll = deleteAll;

// object RTableGDrive.deleteRec
function deleteRec(entryKey)
{
  var self = this;
}
RTableGDrive.prototype.deleteRec = deleteRec;

// object RTableGDrive.initialSync
// local -- dictionary of keys of local entries this way initialSync()
//          can generate events for all that were deleted remotely too
// local = null, won't generate delete events
function initialSync(local)
{
  var self = this;
}
RTableGDrive.prototype.initialSync = initialSync;

// Invoke registered listeners once per remote table to notify of changed records
function recordsChanged(dstoreEvent)
{
}

// Attach one global listener to handle the datastore
function RTableAddListener(cbRecordsChanged)
{
  g_cbRecordsChanged = cbRecordsChanged;
}

// Checks if Dropbox is still connected
function RTableIsOnline()
{
  return false;

  if (g_client == null)
    return false;
  else
    return g_client.isAuthenticated();
}

// Call this once at init time to complete the initialization
function RTableInit(accessToken, cbReady)
{
}

feeds_ns.RTableGDrive = RTableGDrive;
feeds_ns.RTableAddListener = RTableAddListener;
feeds_ns.RTableIsOnline = RTableIsOnline;
feeds_ns.RTableInit = RTableInit;
})();
