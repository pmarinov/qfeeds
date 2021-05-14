// rtable_dbox.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Use Dropbox as a cloud store
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

let g_connectionObj = null;
let g_dbox = null;
let g_utilsCB  = null;

function JournalEntry(tableRow, action)
{
  this.m_row = tableRow;
  this.m_action = action;

  return this;
}

// object RTables.insert()
// Insert an entry into a remote table
function insert(remoteTableName, tableRow)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  let x = new JournalEntry(tableRow, self.TAG_ACTION_SET);
  ctx.newJournal.push(x);
}
RTables.prototype.insert = insert;

// object RTables.reset()
// [Debug function]
// Reset connection to remote table, next load will be a full re-load
function reset(remoteTableName, tableRow)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  g_utilsCB.setPref(ctx.prefRevJournal, 'empty');
  g_utilsCB.setPref(ctx.prefRevFState, 'empty');

  ctx.revJournal = 'empty';
  ctx.freshRevJournal = null;
  ctx.freshRevFState = null;

  ctx.remoteJournal = [];
  ctx.newJournal = [];

  log.info('dropbox: [' + remoteTableName + '] local copy has been reset');
}
RTables.prototype.reset = reset;

// object RTables.eventDone()
// The current event has been processed, trigger the next event (if
// any is pending) for the table
function eventDone(remoteTableName)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  log.info(`dropbox: [${remoteTableName}] RTables.eventDone(), event: ${ctx.events.m_cur.event}`);

  // Completion callback
  if (ctx.events.m_cur.cbCompletion != null)
    ctx.events.m_cur.cbCompletion();

  // Advance to the next event in the queue, if any
  ctx.events.eventDone();
}
RTables.prototype.eventDone = eventDone;

// object RTables.syncLocalTable
// Invoked as a call back to complete the synchronization of the local table,
// it is fed the local table keys and it applies rtFull (the full remote table) against the local one by
// generating events for each entry that needs to change (set or delete events)
//
// Params:
// localTableKeys -- dictionary with all local keys and each value has
//                   fields for synched and reserved set to 0
function p_syncLocalTable(remoteTableName, localTableKeys, rtFull, cbDone)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  // Generate event _updated_ for all remote entries
  let x = 0;
  let rtEntry = null;
  let key = null;
  let objList = [];
  let updateObj = null;
  for (x = 0; x < rtFull.length; ++x)
  {
    rtEntry = rtFull[x];
    // Object for an event Updated
    updateObj =
      {
        isDeleted: false,  // Operation is insert/update, not delete
        data: rtEntry.slice(0)  // Clone the array
      };
    objList.push(updateObj);

    key = rtEntry[0];  // URL of the feed

    if (localTableKeys[key] === undefined)  // No local keys fed into p_syncLocalTable()?
    {
      // Then assume all are not synced
      localTableKeys[key] = {is_synced: false, reserved: 0};
    }

    localTableKeys[key].reserved = 1;
  }

  // Generate event _deleted_ for all that were in local but
  // not in the remote table
  let keys = Object.keys(localTableKeys);
  let index = 0;
  for (x = 0; x < keys.length; ++x)
  {
    key = keys[x];  // key an URL of subscribed feed

    if (localTableKeys[key].reserved == 1)  // RSS subscription is in local AND in remote
      continue;                  // No need to delete

    // Verify if the local entry has been sent to remote table
    if (!localTableKeys[key].is_synced)  // Not synced to remote table?
      continue;                        // It is only local, skip deleting

    // Object for an event Deleted
    // local[key] is in local, but no longer in the remote, IT NEEDS to be deleted
    let simple_row = [];
    simple_row.push(key);  // The row will have the key only
    updateObj =
      {
        isDeleted: true,  // Operation is insert/update, not delete
        data: simple_row.slice(0)  // Clone the array
      };
    objList.push(updateObj);
  }

  // Enqueue the list of entry updates as an event
  ctx.events.runEvent({
    event: 'ENTRY_UPDATE',
    tableName: remoteTableName,
    data: objList,
    cbCompletion: function ()
        {
          // At this point the revision ID of the remote table
          // is only stored in memory: ctxctx.freshRevFState
          //
          // Store this new remote revision into local storage
          // (survives restarts)
          g_utilsCB.setPref(ctx.prefRevFState, ctx.freshRevFState);
          log.info(`dropbox: [${remoteTableName}] completed ENTRY_UPDATE for rev: ${ctx.freshRevFState}`);
        }
  });

  if (cbDone)
    cbDone();

  log.info(`dropbox: [${remoteTableName}] applied full state from rev: ${ctx.freshRevFState}`);
}
RTables.prototype.p_syncLocalTable = p_syncLocalTable;

// object RTables.p_applyJournal
// Apply entries to local tabe via event ENTRY_UPDATE
//
// Params:
//   journal -- remote table journal
function p_applyJournal(remoteTableName, journal, cbDone)
{
  let self = this;

  let rtable = self.m_rtables[remoteTableName];
  let ctx = rtable.m_ctx;

  let x = 0;
  let objList = [];
  for (x = 0; x < journal.length; ++x)
  {
    let jEntry = journal[x];

    // Object for an event
    let updateObj =
      {
        isDeleted: false,  // Operation is insert/update, or delete
        data: []  // Clone the array
      };

    // Is operation delete?
    if (jEntry.m_action == self.TAG_ACTION_DELETE)
    {
      updateObj.isDeleted = true;
    }

    // Clone the array for a row of data
    updateObj.data = jEntry.m_row.slice(0)

    objList.push(updateObj);
  }

  // Enqueue the list of entry updates as an event
  ctx.events.runEvent({
    event: 'ENTRY_UPDATE',
    tableName: remoteTableName,
    data: objList,
    cbCompletion: function ()
        {
          log.info(`dropbox: [${remoteTableName}] completion cb for ENTRY_UPDATE for rev: ${ctx.freshRevFState}`);
          cbDone();
        }
  })
}
RTables.prototype.p_applyJournal = p_applyJournal;

// object RTables.p_rescheduleWriteBack
function p_rescheduleWriteBack()
{
  let self = this;

  // Reschedule
  if (self.m_writeBack != null)
    clearTimeout(self.m_writeBack);

  // Setup the handler of periodic write operations
  self.m_writeBack = setTimeout(writeBackHandler, 5 * 1000, self);
}
RTables.prototype.p_rescheduleWriteBack = p_rescheduleWriteBack;

// object RTables.p_eventHandler
function p_eventHandler(self, tableName, event)
{
  let rtable = self.m_rtables[tableName];
  let ctx = rtable.m_ctx;

  ctx.cbEvents(event);
}
RTables.prototype.p_eventHandler = p_eventHandler;

// object [global] writeBackHandler()
// Set to be invoked periodically by a timer,
// checks if local journals are dirty and sends them to Dropbox
function writeBackHandler(self)
{
  if (self.m_writeBackInProgress)
  {
    self.p_rescheduleWriteBack();
    return;
  }

  self.m_writeBackInProgress = true;

  let tableNames = Object.keys(self.m_rtables);
  for (let i = 0; i < tableNames.length; ++i)
  {
    let tableName = tableNames[i];
    let rtable = self.m_rtables[tableName];
    let ctx = rtable.m_ctx;

    // No new entries
    if (ctx.newJournal.length == 0)
      continue;

    // We need the remote journal in order to append (overwrite it)
    if (!ctx.journalAcquired)
      continue; // Acquisition of remote journal in progress

    // String presentation of all journal entries
    // (Append "new" after "remote")
    let entries = [];
    for (let j = 0; j < ctx.remoteJournal.length; ++j)
      entries.push(JSON.stringify(ctx.remoteJournal[j]));
    for (let j = 0; j < ctx.newJournal.length; ++j)
      entries.push(JSON.stringify(ctx.newJournal[j]));

    // String representation of the entire file on Dropbox
    let strAll = '{\n' +
        '"formatVersion": ' + ctx.formatVersion + ',\n' +
        '"entries": [\n' + entries.join(',\n') + '\n]\n' +
      '}\n';

    let writeMode = null;
    let strPrevVer = 'none';
    let revJournal = ctx.revJournal;

    if (revJournal == 'empty')
    {
      // Journal file doesn't exist remotely
      writeMode = 'overwrite';
      log.info('dropbox: writeBackHandler() -- new journal');
    }
    else
    {
      // Overwrite an existing revision (revJournal)
      // Make sure the version we have locally matches the remote one
      log.info('dropbox: writeBackHandler() -- update journal rev: ' + revJournal);
      writeMode =  {
        '.tag': 'update',
        'update': revJournal,
      };
      strPrevVer = String(revJournal);
    }

    g_dbox.filesUpload(
        {
          contents: strAll,
          path: '/' + ctx.fnameJournal,
          mode: writeMode,
          strict_conflict: true,
          autorename: false,
          mute: true
        })
        .then(function(response)
            {
              // console.log(response);
              log.info('dropbox: RTables.writeBackHandler(' +
                tableName + '), total dump length: ' + strAll.length + ', ' +
                'prev: ' + strPrevVer + ', new: ' + response.rev);

              // Keep track of the new revision of the file on Dropbox
              ctx.revJournal = response.rev;

              // Move newJournal[] at the end of remoteJournal[]
              for (let j = 0; j < ctx.newJournal.length; ++j)
                ctx.remoteJournal.push(ctx.newJournal[j]);

              // Mark as saved (synced to remote)
              // 1. Make a new table in the format of MARK_AS_SYNCED
              let listSynced = []
              for (let j = 0; j < ctx.newJournal.length; ++j)
                listSynced.push(ctx.newJournal[j].m_row);
              // 2. Queue the event
              ctx.events.runEvent({
                  event: 'MARK_AS_SYNCED',
                  tableName: ctx.tableName,
                  data: listSynced,
                  cbCompletion: null
              });

              // Empty newJournal (everything is in remoteJournal now)
              ctx.newJournal = [];
            })
        .catch(function(response)
            {
              if (response.status == 409 && response.error.error_summary.startsWith('path/conflict/file'))
              {
                // Data file doesn't exist on Dropbox
                log.info('dropbox: revision conflict detected for "' + ctx.fnameJournal  + '"');
                ctx.revJournal = 'empty';
              }
              else
              {
                log.error('dropbox: getMetadata for journal "' + ctx.fnameJournal + '"');
                log.error(response);
              }

              log.error('dropbox: filesUpload');
              console.log(response);
              // Callback FAILURE
              // We will retry in the next iteration
            });
  }

  self.m_writeBackInProgress = false;
  self.p_rescheduleWriteBack();
}

// object loadStateMachine [factory]
// Ceates a state machine that handles operation load
//
// remoteTableName -- name of a table for which to handle operation load
function loadStateMachine(objRTables, remoteTableName)
{
  let state = new utils_ns.StateMachine();

  state.add('IDLE', function ()
      {
        // For debug purposes schedule a no-op event
        let ctx = objRTables.m_rtables[remoteTableName].m_ctx;
        ctx.events.runEvent({
            event: 'EMPTY_EVENT',
            tableName: ctx.tableName,
            data: 'Yo1',
            cbCompletion: null
        });

        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify());
      });

  state.add('START_FULL_LOAD', function ()
      {
        //
        // FULL_LOAD: Start sequence for loading updated state from Dropbox
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify());
        let ctx = objRTables.m_rtables[remoteTableName].m_ctx;

        // Reset fresh revisions
        ctx.freshRevJournal = 'empty';
        ctx.freshRevFState = null;

        // Download remote full state (if any fresh detected)
        ctx.tempFullState = [];

        // Start the state machine sequence
        state.advance('GET_REV_JOURNAL');
      });

  state.add('GET_REV_JOURNAL', function ()
      {
        //
        // GET_REV_JOURNAL: Get revision of the journal file
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify());
        let ctx = objRTables.m_rtables[remoteTableName].m_ctx;

        // Root is the App folder on Dropbox
        let baseName = ctx.fnameJournal;
        let tableFName = '/' + baseName;
        g_dbox.filesGetMetadata(
            {
              path: tableFName,
              include_media_info: false,
              include_deleted: false,
              include_has_explicit_shared_members: false
            })
            .then(function(response)
                {
                  log.info('dropbox: getMetadata for journal "' + baseName + '", '
                      + 'rev: ' + response.rev + ', size: ' + response.size);
                  // console.log(response);

                  ctx.freshRevJournal = response.rev;
                  state.advance('GET_REV_FSTATE');
                })
            .catch(function(response)
                {
                  if (response.status == 409 && response.error.error_summary.startsWith('path/not_found'))
                  {
                    // Data file doesn't exist on Dropbox
                    log.info('dropbox: NOT FOUND detected for "' + baseName  + '"');
                    ctx.freshRevJournal = 'empty';
                  }
                  else
                  {
                    log.error('dropbox: getMetadata for journal "' + baseName + '"');
                    log.error(response);
                  }
                  state.advance('GET_REV_FSTATE');
                });
      });

  state.add('GET_REV_FSTATE', function ()
      {
        //
        // GET_REV_FSTATE: Get revision of the full state file
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify());
        let ctx = objRTables.m_rtables[remoteTableName].m_ctx;

        // Root is the App folder on Dropbox
        let baseName = ctx.fnameFState;
        let tableFName = '/' + baseName;
        g_dbox.filesGetMetadata(
            {
              path: tableFName,
              include_media_info: false,
              include_deleted: false,
              include_has_explicit_shared_members: false
            })
            .then(function(response)
                {
                  log.info('dropbox: getMetadata for fstate "' + baseName + '", '
                      + 'rev: ' + response.rev + ', size: ' + response.size);
                  // console.log(response);

                  ctx.freshRevFState = response.rev;
                  state.advance('LOAD_DATA_JOURNAL');
                })
            .catch(function(response)
                {
                  if (response.status == 409 && response.error.error_summary.startsWith('path/not_found'))
                  {
                    // Data file doesn't exist on Dropbox
                    log.info('dropbox: NOT FOUND detected for "' + baseName  + '"');
                    g_utilsCB.setPref(ctx.prefRevFState, 'empty');
                    ctx.freshRevFState = null;
                  }
                  else
                  {
                    log.error('dropbox: getMetadata for fstate "' + baseName + '"');
                    log.error(response);
                  }

                  state.advance('LOAD_DATA_JOURNAL');
                });
      });

  state.add('LOAD_DATA_JOURNAL', function ()
      {
        //
        // LOAD_DATA_JOURNAL: Load journal data from Dropbox
        // (In case local state is out of sync)
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify());
        let ctx = objRTables.m_rtables[remoteTableName].m_ctx;
        let shouldLoad = false;

        if (ctx.freshRevJournal == 'empty')
        {
          // No remote journal file
          log.info('dropbox: [' + remoteTableName + '] No remote journal');

          // Clear local copy of remote journal
          ctx.remoteJournal = [];
        }
        else
        {
          //
          // There is remote journal file, check if we need to load it
          let revJournal = ctx.revJournal;
          if (revJournal == 'empty')
          {
            // Nothing held locally
            log.info('dropbox: [' + remoteTableName + '] No locally loaded remote journal (first time to load)');
            shouldLoad = true;
          }
          else
          {
            // We have both remote version AND local version
            if (revJournal == ctx.freshRevJournal)
            {
              // Restore journal from locally stored string
              log.info('dropbox: [' + remoteTableName + '] Use locally stored JSON');

              // Nothin to load (remote rev is the same as last time)
              state.advance('LOAD_DATA_FULL_STATE');

              // This step of the state machine is completed
              return;
            }
            else
            {
              // Local version and remote versions are different
              shouldLoad = true;
              log.info('dropbox: [' + remoteTableName + '] New remote journal detected');
            }
          }
        }

        if (shouldLoad)
        {
          // There is remote journal, load it
          log.info('dropbox: [' + remoteTableName + '] Loadig remote journal...');

          g_dbox.filesDownload(
              {
                path: '/' + ctx.fnameJournal,
              })
              .then(function(response)
                  {
                    log.info('dropbox: filesDownload, journal, rev: ' + response.rev);
                    // console.info(response);

                    // Parse JSON and keep a copy in local ctx
                    let blob = response.fileBlob;
                    let reader = new FileReader();
                    reader.addEventListener("loadend", function()
                        {
                          // TODO: test with bad JSON
                          // TODO: Check that essential fields are present
                          // TODO: Check that size makes sense
                          let data = JSON.parse(reader.result);
                          // Store locally new version + journal contents
                          ctx.freshRevJournal = response.rev;
                          ctx.remoteJournal = data['entries'];
                          state.advance('LOAD_DATA_FULL_STATE');
                        });
                    // Activate listener "loadend"
                    reader.readAsText(blob);
                  })
              .catch(function(response)
                  {
                    log.error('dropbox: filesDownload');
                    log.error(response);

                    // Global error handler for all database errors
                    utils_ns.domError("dropbox: filesDownload('" + ctx.fnameJournal + "'), " +
                        "error: " + response.error.error_summary);

                    // Retry later
                    state.advance('IDLE');
                  });
        }
        else
        {
          // Nothing to load in this step of the state machine, move to the next
          state.advance('LOAD_DATA_FULL_STATE');
        }
      });

  state.add('LOAD_DATA_FULL_STATE', function ()
      {
        //
        // LOAD_DATA_FULL_STATE: Loads full state file data
        // (In case local state is out of sync)
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify());
        let ctx = objRTables.m_rtables[remoteTableName].m_ctx;
        let shouldLoad = false;

        // Nothing loaded (yet)
        ctx.tempFullState = [];

        if (ctx.freshRevFState == null)
        {
          // No remote full-state file
          log.info('dropbox: [' + remoteTableName + '] No remote full state file, write one');

          // Nothing to load, pass thrgouth no-op APPLY_REMOTE_STATE
          state.advance('APPLY_REMOTE_STATE');

          // Clear local copy of remote journal
          // (prepare for full state write)
          ctx.remoteJournal = [];

          // Invoke callback to initiate writing of full state to Dropbox
          ctx.events.runEvent({
            event: 'WRITE_FULL_STATE',
            tableName: ctx.tableName,
            data: null,
            cbCompletion: null
          });
        }
        else
        {
          //
          // There is remote full-state file, check if we need to load it
          let revFState = g_utilsCB.getPref(ctx.prefRevFState);  // Against current record of remote ver.
          if (revFState === undefined || revFState == 'empty')
          {
            // 1. Nothing held locally
            log.info('dropbox: [' + remoteTableName + '] No locally full-state (first time to load)');
            shouldLoad = true;
          }
          else
          {
            // We have both remote version AND local version
            if (revFState == ctx.freshRevFState)
            {
              log.info('dropbox: [' + remoteTableName + '] No new full-state data, advance to IDLE');

              // 2. Nothing to load, pass thrgouth no-op APPLY_REMOTE_STATE
              state.advance('APPLY_REMOTE_STATE');

              // This step of the state machine is completed
              return;
            }
            else
            {
              // 3. Local version and remote versions are different
              shouldLoad = true;
              log.info('dropbox: [' + remoteTableName + '] New remote full-state detected');
            }
          }
        }

        if (shouldLoad)
        {
          log.info('dropbox: [' + remoteTableName + '] Loading remote full-state...');

          g_dbox.filesDownload(
            {
              path: '/' + ctx.fnameFState,
            })
            .then(function(response)
                {
                  log.info('dropbox: filesDownload, fstate, rev: ' + response.rev);
                  // console.info(response);

                  // In the off-chance that remote rev has changed during
                  // the steps in this state machine
                  ctx.freshRevFState = response.rev;

                  // Parse JSON and keep a copy in local ctx
                  let blob = response.fileBlob;
                  let reader = new FileReader();
                  reader.addEventListener("loadend", function()
                      {
                        // TODO: test with bad JSON
                        // TODO: Check that essential fields are present
                        // TODO: Check that size makes sense
                        let data = JSON.parse(reader.result);
                        ctx.tempFullState = data['entries'];
                        state.advance('APPLY_REMOTE_STATE');
                      });
                  // Activate listener "loadend"
                  reader.readAsText(blob);
                })
            .catch(function(response)
                {
                  log.error('dropbox: filesDownload');
                  console.log(error);

                  // Global error handler for all database errors
                  utils_ns.domError("dropbox: filesDownload('" + ctx.fnameFState + "'), " +
                      "error: " + response.error.error_summary);

                  // Retry later
                  state.advance('IDLE');
                });
        }
        else
        {
          // Nothing to load, pass thrgouth no-op APPLY_REMOTE_STATE
          state.advance('APPLY_REMOTE_STATE');
        }
      });

  state.add('APPLY_REMOTE_STATE', function ()
      {
        //
        // APPLY_REMOTE_STATE: Loads full state file data (if necessary)
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify());
        let ctx = objRTables.m_rtables[remoteTableName].m_ctx;

        //
        // If remote data was loaded it will be reflected in tempFullState,
        // apply it to local data state
        if (ctx.tempFullState.length > 0)
        {
          let rtFull = ctx.tempFullState;

          // Experimental:
          ctx.events.runEvent({
            event: 'SYNC_FULL_STATE',
            tableName: ctx.tableName,
            data: null,
            cbSyncLocalTable: function(remoteTableName, localTableKeys, cbDone)
                {
                  // This function is invoked to complete the
                  // operation of full sync of local tableonce we
                  // already have the keys of the local entries
                  objRTables.p_syncLocalTable(
                      remoteTableName, localTableKeys, rtFull, cbDone);
                }
          });

          // Full state has been consumed => free the memory
          ctx.tempFullState = [];
        }

        //
        // Check if a journal was loaded and apply all the entries from it
        // (all entries from ctx.remoteJournal[]
        if (ctx.freshRevJournal != ctx.revJournal)
        {
          // Version of journal that was already applied to local indexedDB
          //
          // (We load remote journal at every startup, but apply only
          // if prefRevJournal indicates a change)
          let revAppliedJournal = g_utilsCB.getPref(ctx.prefRevJournal);
          log.info('dropbox: [' + remoteTableName + '] revAppliedJournal: ' + revAppliedJournal);

          if (ctx.freshRevJournal != revAppliedJournal)
          {
            log.info('dropbox: [' + remoteTableName + '] revAppliedJournal != freshRevJournal => apply new journal');

            let revToApply = ctx.freshRevJournal;
            objRTables.p_applyJournal(remoteTableName, ctx.remoteJournal, function ()
                {
                    // Journal applied, make a record that local indexed DB reflects that remote version
                    g_utilsCB.setPref(ctx.prefRevJournal, revToApply);
                });
          }

          ctx.revJournal = ctx.freshRevJournal;
          ctx.journalAcquired = true;
        }
        state.advance('IDLE');
      });

  // Set the state machine at initial state 'FULL_LOAD'
  state.advance('START_FULL_LOAD');
  return state;
}

// object RTables.writeFullState()
// Overwrites remote tables with a full new state
function writeFullState(tableName, entries, cbDone)
{
  let self = this;

  let ctx = self.m_rtables[tableName].m_ctx;

  // Why not use JSON.stringify() of the array?
  // For debug purposes it is better to have our own output with ONE entry per line
  // (open the .json files from Dropbox to examine)
  let strEntries = '[';
  let i = 0;
  for (i = 0; i < entries.length; ++i)
  {
    if (i > 0)
      strEntries += ', '
    strEntries += '\n';
    strEntries += "  " + JSON.stringify(entries[i])
  }
  strEntries += ']'

  // String representation of the entire file on Dropbox
  let strAll = '{\n' +
      '"formatVersion": ' + ctx.formatVersion + ',\n' +
      '"entries": ' + strEntries + '\n' +
    '}\n';

  let writeMode = null;
  let strPrevVer = 'none';
  let revFState = g_utilsCB.getPref(ctx.prefRevFState);

  if (revFState === undefined || revFState == 'empty')
    writeMode = 'overwrite';
  else
  {
    // Write over an existing revision (revFState)
    writeMode =  {
      '.tag': 'update',
      // Update only if the version hasn't changed from this in the mean time
      'update': revFState,
    };
    strPrevVer = String(revFState);
  }

  g_dbox.filesUpload(
      {
        contents: strAll,
        path: '/' + ctx.fnameFState,
        mode: writeMode,
        strict_conflict: true,
        autorename: false,
        mute: true
      })
      .then(function(response)
          {
            console.info('RTables.writeFullState[' +
              tableName + '], total dump length: ' + strAll.length + ', ' +
              'prev: ' + strPrevVer + ', new: ' + response.rev);

            // Keep track of the new revision of the file on Dropbox
            g_utilsCB.setPref(ctx.prefRevFState, response.rev);
            // console.log(response);

            // Callback SUCCESS
            cbDone(0);

            // Mark as read
            ctx.events.runEvent({
                event: 'MARK_AS_SYNCED',
                tableName: ctx.tableName,
                data: entries,
                cbCompletion: null
            });
          })
      .catch(function(error)
          {
            log.error('dropbox: filesUpload');
            console.log(error);
            // Callback FAILURE
            cbDone(1);
          });
}
RTables.prototype.writeFullState = writeFullState;

// object RTables.RTable [constructor]
function RTables(rtables, cbEvents, cbDisplayProgress)
{
  let self = this;

  self.m_rtables = {};

  self.TAG_ACTION_INSERT = 'A';  // Add new entry
  self.TAG_ACTION_SET = 'S';     // Set value for an entry (if it alredy exists locally)
  self.TAG_ACTION_DELETE = 'D';  // Delete

  for (let i = 0; i < rtables.length; ++i)
  {
    let entry = rtables[i];

    self.m_rtables[entry.name] = {};
    let rentry = self.m_rtables[entry.name];

    // Context is shared between read and write state machines
    rentry.m_ctx =
    {
      tableName: entry.name,

      //
      // Names of files to keep in Dropbox
      fnameJournal: entry.name + '.journal.json',
      fnameFState: entry.name + '.fstate.json',

      formatVersion: entry.formatVersion,

      //
      // Name of the preference fields for local storage
      // [used with setPref()/getPref()]
      //
      // Store revision of file journal
      prefRevJournal: 'm_local.dbox.' + entry.name + '.journal.rev',
      // Store revision of file full-state
      prefRevFState: 'm_local.dbox.' + entry.name + '.fstate.rev',

      journalAcquired: false,  // The first time
      revJournal: 'empty',  // Not in local storage, only in memory

      // Freshly extracted versions (revisions)
      freshRevJournal: 'empty',
      freshRevFState: 'empty',

      // Event handler
      cbEvents: cbEvents,

      // Journals
      remoteJournal: [],
      newJournal: [],

      // Full state
      // (Temporary, only until applied after load)
      tempFullState: [],

      // Queue of events for the table
      events: null
    };

    // Instantiate read and write state machines,
    // one per remote table
    rentry.m_readStateM = loadStateMachine(self, entry.name);

    // EventQ, one per remote table
    rentry.m_ctx.events =  new utils_ns.EventQ(function (event)
        {
          self.p_eventHandler(self, entry.name, event);
        });
  }

  // Setup the handler of periodic write operations
  self.m_writeBack = setTimeout(writeBackHandler, 5 * 1000, self);
  self.m_writeBackInProgress = false;

  return self;
}

function RTablesConnect(_connectionObj, utilsCB)
{
  g_connectionObj = _connectionObj;
  g_dbox = g_connectionObj.dbox_client;
  g_utilsCB = utilsCB;
}

feeds_ns.RTablesConnect = RTablesConnect;
feeds_ns.RTables = RTables;
})();
