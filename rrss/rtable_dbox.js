// rtable_dbox.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
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

var g_cbRecordsChanged = null;

// Listg of all remote tables, of type:
// { table: string (name), id: integer }
var g_tables = [];

// object RTableDBox.RTableDBox [constructor]
// Object for access of remote table stored in Dropbox
function RTableDBox(name, fields)
{
  var self = this;

  utils_ns.assert(g_datastore != null, 'RTableDBox: g_datastore is null');
  self.m_table = g_datastore.getTable(name);
  self.m_tableId = self.m_table.getId();
  self.m_fields = fields;

  g_tables.push(
      {
        table: name,
        id: self.m_tableId,
        fields: self.m_fields
      });

  return self;
}

// object RTableDBox.insert
// Records an entry into the remote table
function insert(entry)
{
  var self = this;

  self.m_table.insert(entry);
}
RTableDBox.prototype.insert = insert;

// object RTableDBox.readAll
function readAll()
{
  var self = this;

  return self.m_table.query();
}
RTableDBox.prototype.readAll = readAll;

// Invoke registered listeners once per remote table to notify of changed records
function recordsChanged(dstoreEvent)
{
  var i = 0;
  var k = 0;
  var p = 0;
  var rec = null;
  var fields = null;
  var key = null;
  var records = null;
  var objlist = []
  var obj = null;
  // For each table call to notify for changed records
  for (i = 0; i < g_tables.length; ++i)
  {
    // Dropbox doesn't give us a row from the table, it gives us a record
    // which can the be used for inquiring what exactly is this event and
    // also to access the data by calls to record.get('m_field')
    records = dstoreEvent.affectedRecordsForTable(g_tables[i].id);
    fields = g_tables[i].fields;

    // Now for this record, by using the known list of fields, produce
    // an object
    for (k = 0; k < records.length; ++k)
    {
      rec = records[i];

      obj = new Object();
      for (p = 0; p < fields.length; ++p)
      {
        key = fields[p];
        obj[key] = rec.get(key);  // Dropbox.Datastore.Record.get()
      }
      objlist.push(obj);
    }

    g_cbRecordsChanged(g_tables[i].name, objlist);
  }
}

// Attach one global listener to handle the datastore
function RTableAddListener(cbRecordsChanged)
{
  g_cbRecordsChanged = cbRecordsChanged;
  g_datastore.recordsChanged.addListener(recordsChanged);
}

// Call this once at init time to complete the initialization
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
feeds_ns.RTableAddListener = RTableAddListener;
feeds_ns.RTableInit = RTableInit;
})();
