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
var g_cbNewTokenNeeded = null;  // GDrive periodically generates the event "new access token needed"

// object RTableGDrive.p_recordsChanged
// Invoked to handle all operations that signal changes on records
// (deletion, insertion or value changes)
function p_recordsChanged(tableId, isDeleted, isLocal, key, newValue)
{
  try  // GDrive swallows all errors, install my own catchers for displahy of my own errors
  {
    var self = this;

    if (newValue == null)  // Deleting a record is equivalent of setting it to null
    {
      log.info('rtable: ' + key + ' was deleted')
      isDeleted = true;
    }
    var rtable = self.m_tables[tableId];
    var objList = [];
    var updatedObj =
            {
              id: key, // Property of this record
              isLocal: isLocal,  // Feeedback from locally initiated operation
              isDeleted: isDeleted,  // The record was deletd, data is null
              data: null
            };
    if (newValue != null)
      updatedObj.data = utils_ns.copyFields(newValue, [])  // record data
    else
      updatedObj.data = {};  // We still need a object even of only to convey the field that is the key
    updatedObj.data[rtable.key] = key;  // Add the key_name:key_valye as a field
    objList.push(updatedObj);
    g_cbRecordsChanged(tableId, objList);
  }
  catch (e)  // Error in my code, display it, then re-throw
  {
    log.error('rtable: ' + e.message);
    var errorObj =
    {
      stack: e.stack
    };
    window.onerror(e.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, errorObj);
    throw e;
  }
}
RTablesGDrive.prototype.p_recordsChanged = p_recordsChanged;

function getStats()
{
  var self = this;

  var stats =
  {
    bytes: self.m_bytesUsed,
    records: 0,
    table: '\'Apps/rrss/rtables.rrss\'',
    maxBytes: '10 MB'
  }

  var i = 0;
  var rtable = null;
  for (i = 0; i < self.m_tables.length; ++i)
  {
    rtable = self.m_tables[i];
    stats.records += rtable.map.size;
  }

  return stats;
}
RTablesGDrive.prototype.getStats = getStats;

// object RTableGDrive.p_loadRTFile
function p_loadRTFile(rtFileID, cbDone, cbDisplayProgress)
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
          log.info('rtable: bytes used ' + rtModel.bytesUsed);
          self.m_bytesUsed = rtModel.bytesUsed;

          for (i = 0; i < self.m_tables.length; ++i)
          {
            (function ()  // closure for rtable
            {
              // Create a map
              var tableId = i;
              var rtable = self.m_tables[i];
              rtable.map = rtModel.getRoot().get(rtable.name);
              log.info('rtable: table ' + rtable.name + ': ' +
                       rtable.map.size + ' records');

              // Attach listeners
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUES_ADDED,
                  function (event)
                  {
                      self.p_recordsChanged(tableId, false, event.isLocal, event.property, event.newValue);
                      log.trace('rtable: ' + rtable.name + ', event: added');
                  });
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED,
                  function (event)
                  {
                      self.p_recordsChanged(tableId, false, event.isLocal, event.property, event.newValue);
                      log.trace('rtable: ' + rtable.name + ', event: changed');
                  });
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUES_SET,
                  function (event)
                  {
                      self.p_recordsChanged(tableId, false, event.isLocal, event.property, event.newValue);
                      log.trace('rtable: ' + rtable.name + ', event: set');
                  });
              rtable.map.addEventListener(gapi.drive.realtime.EventType.VALUES_REMOVED,
                  function (event)
                  {
                      self.p_recordsChanged(tableId, true, event.isLocal, event.property, event.newValue);
                      log.trace('rtable: ' + rtable.name + ', event: removed');
                  });
            })();
          }
          cbDisplayProgress(11);
          cbDone(1);
        }
        catch (e)  // Error in my code, display it, then re-throw
        {
          log.error('rtable: ' + e.message);
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
          log.error('rtable: ' + e.message);
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
        cbDone(0);

        var msg = 'rtable: "' + rtError.type + '", isFatal=' + rtError.isFatal + ', "' + rtError.message + '"';

        if (rtError.type == gapi.drive.realtime.ErrorType.TOKEN_REFRESH_REQUIRED)
        {
          log.warn(msg);
          g_authenticated = false;
          g_cbNewTokenNeeded();
        }
        else
          utils_ns.domError(msg);
      });
}
RTablesGDrive.prototype.p_loadRTFile = p_loadRTFile;

// object RTableGDrive.p_createAndLoadRTFile
function p_createAndLoadRTFile(parentFolderID, cbDone)
{
  var self = this;

  var resource =
  {
    'resource':
    {
      mimeType: 'application/vnd.google-apps.drive-sdk',
      description: 'rtables.rrss',
      title: g_documentName
    }
  };

  if (parentFolderID != null)
    resource['resource'].parents = [ { id: parentFolderID } ];

  // 1: Create the shortcut file
  gapi.client.drive.files.insert(resource).execute(function (resp)
      {
        self.p_loadRTFile(resp.id, cbDone);
      });
}
RTablesGDrive.prototype.p_createAndLoadRTFile = p_createAndLoadRTFile;

// object RTablesGDrive.p_getFolderID
function p_getFolderID(folderName, parentFolderID, cbProcessID)
{
  var query_folder = "mimeType='application/vnd.google-apps.folder'"
  if (folderName != null)
    query_folder += " and title='" + folderName + "'"
  if (parentFolderID != null)
    query_folder += " and '" + parentFolderID + "' in parents"
  query_folder += " and (not trashed)"
  gapi.client.drive.files.list(
        {
          'q': query_folder
        }).execute(function (results)
        {
          cbProcessID(results)
        })
}
RTablesGDrive.prototype.p_getFolderID = p_getFolderID;

// object RTablesGDrive.p_createFolder
function p_createFolder(folderName, parentFolderID, cbDone)
{
  var self = this;

  var resource =
  {
    'resource':
    {
      mimeType: 'application/vnd.google-apps.folder',
      description: folderName,
      title: folderName
    }
  };

  if (parentFolderID != null)
    resource['resource'].parents = [ { id: parentFolderID } ];

  // Create a folder
  gapi.client.drive.files.insert(resource).execute(function (resp)
      {
        cbDone(resp.id);
      });
}
RTablesGDrive.prototype.p_createFolder = p_createFolder;

// object RTablesGDrive.p_createAppFolder
// Creates "Apps/rrss" folder
function p_createAppFolder(cbDone)
{
  var self = this;

  log.info("rtable: Find ID of folder 'Apps'...")
  self.p_getFolderID('Apps', null, function(results)
      {
        if (results.items === undefined || results.items.length == 0)
        {
          // Folder Apps doesn't exist
          // Create "Apps/rrss"
          log.info("rtable: Creating 'Apps'...")
          self.p_createFolder('Apps', null, function (folderAppsID)
              {
                log.info("rtable: ID of folder 'Apps' is " + folderAppsID + "...")
                log.info("rtable: Creating folder 'Apps/rrss'...")
                self.p_createFolder('rrss', folderAppsID, function (folder_rrssID)
                    {
                      log.info("rtable: ID of folder 'Apps/rrss' is " + folder_rrssID + "...")
                      cbDone(folder_rrssID);
                    });
              })
          return;
        }

        log.info("rtable: ID of folder 'Apps' is " + results.items[0].id + "...")
        log.info("rtable: Find ID of folder 'rrss'...")
        var folderAppsID = results.items[0].id;
        self.p_getFolderID('rrss', folderAppsID, function(results)
            {
              // Folder 'Apps' exists but no 'rrss' in it
              if (results.items === undefined || results.items.length == 0)
              {
                log.info("rtable: Creating folder 'Apps/rrss'...")
                self.p_createFolder('rrss', folderAppsID, function (folder_rrssID)
                    {
                      log.info("rtable: ID of folder 'Apps/rrss' is " + folder_rrssID + "...")
                      cbDone(folder_rrssID);
                    });
              }
              else
              {
                log.info("rtable: ID of folder 'Apps/rrss' is " + results.items[0].id + "...")
                cbDone(results.items[0].id);
              }
            })
      })
}
RTablesGDrive.prototype.p_createAppFolder = p_createAppFolder;

// object RTablesGDrive.RTableGDrive [constructor]
function RTablesGDrive(rtables, cbDone, cbDisplayProgress)
{
  var self = this;

  self.m_tables = rtables;
  self.m_bytesUsed = 0;

  // Create or open folder "App/rss"
  cbDisplayProgress(8);
  self.p_createAppFolder(function (parentFolderID)
      {
        cbDisplayProgress(9);
        // Find the short-cut file for the real-time document
        var query = 'title=' + "'" + g_documentName + "'" + " and (not trashed)"
        gapi.client.drive.files.list(
              {
                'q': query
              }).execute(function (results)
              {
                if (results.items !== undefined && results.items.length > 0)
                {
                  //
                  // Load the short-cut file
                  cbDisplayProgress(10);
                  log.info('rtable: Opening Apps/rrss/' + g_documentName + '...')

                  // Handle case of the creation of more than one stream (file) under the same name by Google Drive
                  // Is it not clear why this is happening, we are only interested in the oldest file
                  var i = 0;
                  var foldest = results.items[0];
                  var d1 = 0;
                  var d2 = 0;
                  for (i = 0; i < results.items.length; ++i)
                  {
                    d1 = Date.parse(foldest.createdDate);
                    d2 = Date.parse(results.items[i].createdDate)
                    if (d2 < d1)
                      foldest = results.items[i];
                  }
                  if (results.items.length > 1)
                  {
                    log.warn('RTableGDrive: more than one (total: ' + results.items.length + ') short cut files for \''
                             + g_documentName + '\', using the oldest only');
                  }
                  self.p_loadRTFile(foldest.id, cbDone, cbDisplayProgress);
                }
                else
                {
                  //
                  // Create the short-cut file and then load
                  log.info('rtable: ' + g_documentName + ' is new')
                  self.p_createAndLoadRTFile(parentFolderID, cbDone, cbDisplayProgress);
                }
              });
      });

  return self;
}
RTablesGDrive.prototype.p_createAndLoadRTFile = p_createAndLoadRTFile;

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
function deleteRec(tableID, entryKey)
{
  var self = this;

  utils_ns.assert(tableID < self.m_tables.length, 'RTableGDrive: "tableId" out of range');
  utils_ns.assert(tableID >= 0, 'RTableGDrive: "tableId" is negative');
  var rtable = self.m_tables[tableID].map;

  var value = rtable.delete(entryKey);
  var result_str = 'OK';
  if (value == null)
    result_str = 'no existing value';
  log.info('RTableGDrive: deleting Id ' + entryKey + '...' + result_str);
}
RTablesGDrive.prototype.deleteRec = deleteRec;

// object RTableGDrive.initialSync
// local -- dictionary of keys of local entries this way initialSync()
//          can generate events for all that were deleted remotely too
// local = null, won't generate delete events
function initialSync(tableID, local, cbDisplayProgress)
{
  var self = this;

  utils_ns.assert(tableID < self.m_tables.length, 'RTableGDrive: "tableId" out of range');
  utils_ns.assert(tableID >= 0, 'RTableGDrive: "tableId" is negative');
  var rtable = self.m_tables[tableID].map;

  var allKeys = rtable.keys();
  log.info('initialSync: for \'' +  self.m_tables[tableID].name + '\': total number of keys ' + allKeys.length);

  var x = 0;
  var objlist = [];
  var rec = null;
  var updateObj = null;
  var key = null;
  var keyName = null;

  for (x = 0; x < allKeys.length; ++x)
  {
    // One key/value pair
    key = allKeys[x];  // Key
    rec = rtable.get(key);  // Value

    // Imitate generation of an updated obj
    updateObj =
      {
        isLocal: false,  // Feeedback from locally initiated operation
        isDeleted: false,  // The record was deletd, data is null
        data: utils_ns.copyFields(rec, [])  // record data
      };
    keyName = self.m_tables[tableID].key;
    updateObj.data[keyName] = key;  // Add the key_name:key_valye as a field
    objlist.push(updateObj);

    if (local == null)
      continue;

    if (local[key] === undefined)
      continue;

    local[key] = 1;
  }
  g_cbRecordsChanged(tableID, objlist);

  cbDisplayProgress(100);

  if (local == null)
    return;

  // Generate event _deleted_ for all that were in local but
  // not in the remote table
  var keys = Object.keys(local);
  objlist = [];
  for (x = 0; x < keys.length; ++x)
  {
    key = keys[x];
    if (local[key] == 1)  // In local AND in remote
      continue;

    // local[key] is only in local, needs to be deleted
    updateObj =
      {
        id: key, // Id of this record, created by Dropbox
        isLocal: false,  // Feeedback from locally initiated operation
        isDeleted: true,  // The record was deletd, data is null
        data: null  // record data, no data needed for delete operation
      };
    objlist.push(updateObj);
  }
  log.info('rtable.initialSync: ' + objlist.length + ' record(s) not in remote table that will be deleted');
  g_cbRecordsChanged(tableID, objlist);
}
RTablesGDrive.prototype.initialSync = initialSync;

// Attach one global listener to handle the datastore
function RTablesAddListener(cbRecordsChanged)
{
  g_cbRecordsChanged = cbRecordsChanged;
}

// In response to event "new token needed" this method will be invoked to set it
function RTablesSetAccessToken(accessToken)
{
  var token =
  {
    access_token: accessToken
  }
  gapi.auth.setToken(token);
  g_authenticated = true;
  log.warn('rtable: access token refreshed');
}

// Attach one global listener to handle event "refresh access token"
function RTablesAddListenerReconnect(cbNewTokenNeeded)
{
  g_cbNewTokenNeeded = cbNewTokenNeeded;
}

// Checks if Dropbox is still connected
function RTablesIsOnline()
{
  return g_authenticated;
}

// Call this once at init time to complete the initialization
function RTablesInit(accessToken, cbReady, displayProgress)
{
  gapi.load('auth:client', function()
      {
        var token =
        {
          access_token: accessToken
        };
        gapi.auth.setToken(token);
        g_authenticated = true;
        displayProgress(6);
        gapi.client.load('drive', 'v2', cbReady);
      });
}

feeds_ns.RTablesGDrive = RTablesGDrive;
feeds_ns.RTablesAddListener = RTablesAddListener;
feeds_ns.RTablesAddListenerReconnect = RTablesAddListenerReconnect;
feeds_ns.RTablesSetAccessToken = RTablesSetAccessToken;
feeds_ns.RTablesIsOnline = RTablesIsOnline;
feeds_ns.RTablesInit = RTablesInit;
})();
