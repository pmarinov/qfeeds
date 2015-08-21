// rtable_gdrive.js, -*- mode: javascript; fill-column: 100; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2015, Peter Marinov and Contributors
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

var g_documentName = 'rtables.rrss';
var g_authenticated = false;
var g_cbRecordsChanged = null;

// object RTableGDrive.p_recordsChanged
// Invoked to handle all operations that signal changes on records
// (deletion, insertion or value changes)
function p_recordsChanged(tableId, isDeleted, isLocal, key, newValue)
{
  try  // GDrive swallows all errors, install my own catchers for displahy of my own errors
  {
    var self = this;

    var rtable = self.m_tables[tableId];
    var objList = [];
    var updatedObj =
            {
              id: key, // Property of this record
              isLocal: isLocal,  // Feeedback from locally initiated operation
              isDeleted: isDeleted,  // The record was deletd, data is null
              data: utils_ns.copyFields(newValue, [])  // record data
            };
    updatedObj.data[rtable.key] = key;  // Add the key_name:key_valye as a field
    objList.push(updatedObj);
    g_cbRecordsChanged(tableId, objList);
  }
  catch (e)  // Error in my code, display it, then re-throw
  {
    log.error('Ooops!');
    var errorObj =
    {
      stack: e.stack
    };
    window.onerror(e.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, errorObj);
    throw e;
  }
}
RTablesGDrive.prototype.p_recordsChanged = p_recordsChanged;

// object RTableGDrive.p_loadRTFile
function p_loadRTFile(rtFileID, cbDone)
{
  var self = this;

  // 1: Load rtDocument
  // 2: Define/Load the real-time data model
  gapi.drive.realtime.load(rtFileID,
      function (rtDocument) // onFileLoaded
      {
        try  // GDrive swallows all errors, install my own catchers for display of my own errors
        {
          log.info('onFileLoaded for ' + g_documentName);

          var i = 0;
          var rtModel = rtDocument.getModel();
          log.info('RTableGDriveTables: bytes used ' + rtModel.bytesUsed);

          for (i = 0; i < self.m_tables.length; ++i)
          {
            (function ()  // closure for rtable
            {
              // Create a map
              var tableId = i;
              var rtable = self.m_tables[i];
              rtable.map = rtModel.getRoot().get(rtable.name);
              log.info('RTableGDriveTables: table ' + rtable.name + ': ' +
                       rtable.map.size + ' records');

              // Attach listeners
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUES_ADDED,
                  function (event)
                  {
                      console.info('RTableGDriveTables: ' + rtable.name + ', event: added ' + event.values);
                  });
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED,
                  function (event)
                  {
                      self.p_recordsChanged(tableId, false, event.isLocal, event.property, event.newValue);
                      console.info('RTableGDriveTables: ' + rtable.name + ', event: changed ' + event.values);
                  });
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUES_SET,
                  function (event)
                  {
                      console.info('RTableGDriveTables: ' + rtable.name + ', event: set ' + event.values);
                  });
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUES_REMOVED,
                  function (event)
                  {
                      console.info('RTableGDriveTables: ' + rtable.name + ', event: removed ' + event.values);
                  });
            })();
          }
          cbDone(1);
        }
        catch (e)  // Error in my code, display it, then re-throw
        {
          log.error('Ooops!');
          var errorObj =
          {
            stack: e.stack
          };
          window.onerror(e.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, errorObj);
          throw e;
        }
      },
      function (rtModel) // initializerFn
      {
        try  // GDrive swallows all errors, install my own catchers for display of my own errors
        {
          log.info('initializerFn for ' + g_documentName);

          // Create the data model
          var i = 0;
          var rtMap = null;
          var root = rtModel.getRoot();

          for (i = 0; i < self.m_tables.length; ++i)
          {
            rtMap = rtModel.createMap();
            root.set(self.m_tables[i].name, rtMap);
            self.m_tables[i].map = rtMap;
          }
          cbDone(2);
        }
        catch (e)  // Error in my code, display it, then re-throw
        {
          log.error('Ooops!');
          var errorObj =
          {
            stack: e.stack
          };
          window.onerror(e.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, errorObj);
          throw e;
        }
      },
      function (rtError) // errorFn
      {
        try  // GDrive swallows all errors, install my own catchers for display of my own errors
        {
          log.info('errorFn ' + rtError +  'for ' +  + g_documentName);
          cbDone(0);
        }
        catch (e)  // Error in my code, display it, then re-throw
        {
          log.error('Ooops!');
          var errorObj =
          {
            stack: e.stack
          };
          window.onerror(e.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, errorObj);
          throw e;
        }
      });
}
RTablesGDrive.prototype.p_loadRTFile = p_loadRTFile;

// object RTableGDrive.p_createAndLoadRTFile
function p_createAndLoadRTFile(cbDone)
{
  var self = this;

  var resource =
  {
    'resource':
    {
      mimeType: 'application/vnd.google-apps.drive-sdk',
      description: 'rtabler.rrss',
      title: g_documentName
    }
  };

  // 1: Create the shortcut file
  gapi.client.drive.files.insert(resource).execute(function (resp)
      {
        self.p_loadRTFile(resp.id, cbDone);
      });
}
RTablesGDrive.prototype.p_createAndLoadRTFile = p_createAndLoadRTFile;

// object RTablesGDrive.RTableGDrive [constructor]
function RTablesGDrive(rtables, cbDone)
{
  var self = this;

  self.m_tables = rtables;

  // Find the short-cut file for the real-time document
  var query = 'title=' + "'" + g_documentName + "'" + " and not trashed"
  gapi.client.drive.files.list(
        {
          'q': query
        }).execute(function (results)
        {
          if (results.items !== undefined && results.items.length > 0)
          {
            // Load the short-cut file
            log.info('RTableGDrive: Opening ' + g_documentName + '...')
            self.p_loadRTFile(results.items[0].id, cbDone);
            if (results.items.length > 1)
              log.warning('RTableGDrive: more than one short cut file for ' + g_documentName);
          }
          else
          {
            // Create the short-cut file and then load
            log.info('RTableGDrive: ' + g_documentName + ' is new')
            self.p_createAndLoadRTFile(cbDone);
          }
        });

  // Record status for listeners
  self.RECORD_UPDATED = 1;
  self.RECORD_DELETED = 2;
  self.RECORD_LOCAL = 3;  // feedback from local RTable.insert/delete actions
  return self;
}
RTableGDrive.prototype.p_createAndLoadRTFile = p_createAndLoadRTFile;

// object RTableGDrive.RTableGDrive [constructor]
// TODO: remove this is leftover from Dropbox
// Used for access of remote table stored in Dropbox
// _fields_ is the list of all fields of objects inserted in the table
// _key_ name of primary key, used as Dropbox ID
// Set _key_ to '' to activate automatically generated IDs by Dropbox
function RTableGDrive(name, fields, key, cbDone)
{
  var self = this;

  self.m_map = null;
  self.m_title = name + '.rtable.rrss';
  self.m_key = key;

  var query = 'title=' + "'" + self.m_title + "'" + " and not trashed"
  gapi.client.drive.files.list(
        {
          // TODO: add mimeType for short cut file as part of the query
          'q': query
        }).execute(function (results)
        {
          if (results.items !== undefined && results.items.length > 0)
          {
            log.info('RTableGDrive: Opening ' + self.m_title + '...')
            self.p_loadRTFile(results.items[0].id, cbDone);
            if (results.items.length > 1)
              log.warning('RTableGDrive: more than one short cut file for ' + self.m_title);
          }
          else
          {
            log.info('RTableGDrive: ' + self.m_title + ' is new')
            self.p_createAndLoadRTFile(cbDone);
          }
        });

  // Record status for listeners
  self.RECORD_UPDATED = 1;
  self.RECORD_DELETED = 2;
  self.RECORD_LOCAL = 3;  // feedback from local RTable.insert/delete actions
  return self;
}

// object RTableGDrive.insert
// Records an entry into the remote table
function insert(tableID, entry)
{
  var self = this;

  utils_ns.assert(tableID < self.m_tables.length, 'RTableGDrive: "tableId" out of range');
  utils_ns.assert(tableID >= 0, 'RTableGDrive: "tableId" is negative');
  var rtable = self.m_tables[tableID].map;

  // Avoid data duplication as both remote ID and key as fields contents are the same
  var keyName = self.m_tables[tableID].key; 
  var key = entry[keyName];
  var optimized = utils_ns.copyFields(entry, [ keyName ]);  // Omit keyName while copying
  rtable.set(key, optimized);  // Set/overwrite optimized value for this key
}
RTablesGDrive.prototype.insert = insert;

// object RTableGDrive.readAll
function readAll()
{
  var self = this;

  // 1. Get all keys
  // 2. Read all values, one by one, for these keys
  return null;
}
RTablesGDrive.prototype.readAll = readAll;

// object RTableGDrive.deleteAll
function deleteAll()
{
  var self = this;
}
RTablesGDrive.prototype.deleteAll = deleteAll;

// object RTableGDrive.deleteRec
function deleteRec(entryKey)
{
  var self = this;
}
RTablesGDrive.prototype.deleteRec = deleteRec;

// object RTableGDrive.initialSync
// local -- dictionary of keys of local entries this way initialSync()
//          can generate events for all that were deleted remotely too
// local = null, won't generate delete events
function initialSync(local)
{
  var self = this;
}
RTablesGDrive.prototype.initialSync = initialSync;

// Invoke registered listeners once per remote table to notify of changed records
function recordsChanged(dstoreEvent)
{
}

// Attach one global listener to handle the datastore
function RTablesAddListener(cbRecordsChanged)
{
  g_cbRecordsChanged = cbRecordsChanged;
}

// Checks if Dropbox is still connected
function RTablesIsOnline()
{
  return g_authenticated;
}

// Call this once at init time to complete the initialization
function RTablesInit(accessToken, cbReady)
{
  gapi.load('auth:client', function()
      {
        var token =
        {
          access_token: accessToken
        }
        gapi.auth.setToken(token);
        g_authenticated = true;
        gapi.client.load('drive', 'v2', cbReady);
      });
}

feeds_ns.RTablesGDrive = RTablesGDrive;
feeds_ns.RTablesAddListener = RTablesAddListener;
feeds_ns.RTablesIsOnline = RTablesIsOnline;
feeds_ns.RTablesInit = RTablesInit;
})();
