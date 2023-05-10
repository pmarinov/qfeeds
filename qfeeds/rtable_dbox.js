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
const g_journalMaxSize = 1024 * 4;

const g_stateMachineIntervalSeconds = 120;
const g_stateMachineIntervalTickSeconds = 60;

// All tables
// (Tables are created, then can be activated or go offline when connection is lost)
let g_tables = null;

function JournalEntry(tableRow, action)
{
  this.m_row = tableRow;
  this.m_action = action;

  return this;
}

// object RTables.insert()
// Insert an entry into a remote table
//
// Entries are pushed into a vector and picked up
// writeBackHandler()
function insert(remoteTableName, tableRow)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  let x = new JournalEntry(tableRow, self.TAG_ACTION_SET);
  ctx.newJournal.push(x);

  // Schedule the writeBackHandler() if not already scheduled
  self.p_rescheduleWriteBack(remoteTableName);
}
RTables.prototype.insert = insert;

// object RTables.deleteRec()
// Insert a delete request entry into a remote table journal
//
// Entries are pushed into a vector and picked up
// writeBackHandler()
function deleteRec(remoteTableName, tableRow)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  let x = new JournalEntry(tableRow, self.TAG_ACTION_DELETE);
  ctx.newJournal.push(x);

  // Schedule the writeBackHandler() if not already scheduled
  self.p_rescheduleWriteBack(remoteTableName);
}
RTables.prototype.deleteRec = deleteRec;

// object RTables.reset()
// [Debug function]
// Reset connection to remote table, next load will be a full re-load
function reset(remoteTableName, tableRow)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  g_utilsCB.setPref(ctx.prefRevJournal, 'empty');
  g_utilsCB.setPref(ctx.prefRevFState, 'empty');
  log.info(`dropbox: [${remoteTableName}] reset: ${ctx.prefRevJournal}`);
  log.info(`dropbox: [${remoteTableName}] reset: ${ctx.prefRevFState}`);

  ctx.revJournal = 'empty';
  ctx.idJournal = 'empty';
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
function eventDone(remoteTableName, operation_exit_code)
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
    cbCompletion: function (exit_code)
        {
          // At this point the revision ID of the remote table
          // is only stored in memory: ctx.freshRevFState
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
    cbCompletion: function (exit_code)
        {
          log.info(`dropbox: [${remoteTableName}] completion cb for ENTRY_UPDATE for rev: ${ctx.freshRevFState}`);
          cbDone();
        }
  })
}
RTables.prototype.p_applyJournal = p_applyJournal;

// object RTables.p_rescheduleWriteBack
function p_rescheduleWriteBack(remoteTableName)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  // Schedule the writeBackHandler() if not already scheduled
  //
  // It is an interval -- it will try every 5 seconds until it
  // manages to complete the write-back operation
  if (ctx.m_writeBack == null)
  {
    log.info(`dropbox: [${remoteTableName}] Activate writeBack() timer`);
    ctx.m_writeBack = setInterval(p_writeBackHandler, 5 * 1000, self, remoteTableName);
  }
}
RTables.prototype.p_rescheduleWriteBack = p_rescheduleWriteBack;

// object RTables.p_deactivateWriteBack
//
// Deactvate the timer for writeBack() when no more entries are
// waiting in the journal
function p_deactivateWriteBack(remoteTableName)
{
  let self = this;
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  // No pending entries, no need for timer
  if (ctx.newJournal.length > 0)
    return;

  if (ctx.m_writeBack != null)
  {
    log.info(`dropbox: [${remoteTableName}] Deactivate writeBack() timer`);
    clearInterval(ctx.m_writeBack);
    ctx.m_writeBack = null;
  }
}
RTables.prototype.p_deactivateWriteBack = p_deactivateWriteBack;


// object RTables.p_eventHandler
function p_eventHandler(self, tableName, event)
{
  let rtable = self.m_rtables[tableName];
  let ctx = rtable.m_ctx;

  ctx.cbEvents(event);
}
RTables.prototype.p_eventHandler = p_eventHandler;


// object [global] p_writeBackHandler()
//
// Set to be invoked periodically by a timer, checks if local journals
// are dirty and sends them to Dropbox
function p_writeBackHandler(self, remoteTableName)
{
  let ctx = self.m_rtables[remoteTableName].m_ctx;

  // No new entries
  if (ctx.newJournal.length == 0)
  {
    ctx.m_writeBackInProgress = false;
    self.p_deactivateWriteBack(remoteTableName);
    return;
  }

  // Check if we are off-line
  if (!self.m_rtables[remoteTableName].m_active)
  {
    // Skip the scheduled write
    log.info(`dropbox:  [${remoteTableName}] writeBackHandler(), status offline, skipped one write`);
    return;
  }

  // Only one operation active at a time (avoid re-entrancy),
  // reschedule if still in the previous one
  if (ctx.m_writeBackInProgress)
  {
    ++ctx.m_progressCnt;
    if (ctx.m_progressCnt > 3)
    {
      // We waited for too long for previous to complete, sound the
      // alarm
      utils_ns.domError(`dropbox: [${remoteTableName}] writeBackHandler() failed to complete`);
      return;
    }

    // Skip the scheduled write
    log.info(`dropbox:  [${remoteTableName}] writeBackHandler(), skipped one write`);

    // Wait until the next call scheduled by the setInterval() function
    return;
  }

  // Protect against re-entrant invocation
  ctx.m_writeBackInProgress = true;
  ctx.m_progressCnt = 0;

  let rtable = self.m_rtables[remoteTableName];
  if (rtable.m_readStateM.m_curState != 'IDLE')
  {
    log.info(`dropbox: writeBackHandler(${remoteTableName}), readStateM not in IDLE, skipped one write`)
    return;
  }

  // We need the remote journal in order to append (overwrite it)
  if (!ctx.journalAcquired)
  {
    log.info(`dropbox: writeBackHandler(${remoteTableName}), remote journal not acquire yet, skipped one write`)
    return; // Acquisition of remote journal still pending
  }

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
  let lenStrAll = strAll.length;

  // Record up to which entry in the journal is being sent to remote
  // journal file
  let markRecordPoint = ctx.newJournal.length;

  if (lenStrAll > g_journalMaxSize)
  {
    // Threshold reached:
    //
    // The full data representation is full state file + and journal
    // file, it is time to move all journal entries into the full state file
    //
    // The journal entries are already applied in the local
    // IndexedDB, we can write via a WRITE_FULL_STATE, and then
    // delete the journal file

    log.info(`dropbox: writeBackHandler(${remoteTableName}) journal size limit reached: ` +
             `${lenStrAll} > ${g_journalMaxSize}`);
    log.info(`dropbox: writeBackHandler(${remoteTableName}), ${markRecordPoint} journal entries`);

    // == 1 == Enqueue event SYNC_FULL_STATE
    // (This will produce its own MARK_AS_SYNCED)
    scheduled = true;
    ctx.events.runEvent({
        event: 'WRITE_FULL_STATE',
        tableName: ctx.tableName,
        data: null,
        cbCompletion: function(exit_code) {
            if (code != 0)
            {
              // Ended in error
              // Then this is the end of the callback operation
              ctx.m_writeBackInProgress = false;
              self.p_deactivateWriteBack(remoteTableName);
              return;
            }

            // == 2 == Delete the entries up to markRecordPoint from ctx.newJournal[]
            log.info(`dropbox: writeBackHandler(${remoteTableName}), Delete ${markRecordPoint} journal entries`);
            ctx.newJournal.splice(0, markRecordPoint);

            // == 3 == Delete the journal file
            log.info(`dropbox: writeBackHandler(${remoteTableName}), delete journal file: ${ctx.fnameJournal}`);
            log.info(`dropbox: writeBackHandler(${remoteTableName}), filesDelete(${ctx.idJournal})`);
            g_dbox.filesDeleteV2(
                {
                  path: ctx.profilePath + '/' + ctx.fnameJournal,
                })
                .then(function(response)
                    {
                      // The end of the callback operation
                      ctx.m_writeBackInProgress = false;
                      self.p_deactivateWriteBack(remoteTableName);

                      // Log it
                      log.info(`dropbox: writeBackHandler(${remoteTableName}), filesDelete(${ctx.fnameJournal}), deleted OK`);
                    })
                .catch(function(response)
                    {
                      // The end of the callback operation
                      ctx.m_writeBackInProgress = false;
                      self.p_deactivateWriteBack(remoteTableName);

                      log.error(response);

                      // The error could have 2 sources
                      //
                      // 1: Dropbox error, then we have fields response.error.error_summary
                      // 2: No-Dropbox error, then we have response.message
                      let err_msg = '!response.message!'
                      if (response.error !== undefined && response.error.error_summary !== undefined)
                        err_msg = response.error.error_summary
                      else
                        err_msg = response.message;

                      utils_ns.domError("dropbox: filesDelete('" + ctx.fnameJournal + "'), " +
                          "error: " + err_msg);
                    });
        }
    });
  }
  else
  {
    //
    // The journal table is still under the threshold size, write it
    // as a journal file

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
          path: ctx.profilePath + '/' + ctx.fnameJournal,
          mode: writeMode,
          strict_conflict: true,
          autorename: false,
          mute: true
        })
        .then(function(response)
            {
              // console.log(response);
              log.info('dropbox: RTables.writeBackHandler(' +
                remoteTableName + '), total dump length: ' + strAll.length + ', ' +
                'prev: ' + strPrevVer + ', new: ' + response.result.rev);

              // Keep track of the new revision of the file on Dropbox
              ctx.revJournal = response.result.rev;

              // Move newJournal[] at the end of remoteJournal[]
              for (let j = 0; j < markRecordPoint; ++j)
                ctx.remoteJournal.push(ctx.newJournal[j]);

              // Mark as saved (synced to remote)
              // 1. Make a new table in the format of MARK_AS_SYNCED
              let listSynced = []
              for (let j = 0; j < markRecordPoint; ++j)
                listSynced.push(ctx.newJournal[j].m_row);

              // 2. Delete the entries up to markRecordPoint from ctx.newJournal[]
              ctx.newJournal.splice(0, markRecordPoint);

              // 3. Queue the event
              ctx.events.runEvent({
                  event: 'MARK_AS_SYNCED',
                  tableName: ctx.tableName,
                  data: listSynced,
                  cbCompletion: null
              });

              // Empty newJournal (everything is in remoteJournal now)
              // No new entries
              if (ctx.newJournal.length >= 0)
                log.info(`dropbox: writeBackHandler(${remoteTableName}) ${ctx.newJournal.length} new entries acumulated`);

              // The end of the callback operation
              ctx.m_writeBackInProgress = false;
              self.p_deactivateWriteBack(remoteTableName);
            })
        .catch(function(response)
            {
              // The end of the callback operation
              ctx.m_writeBackInProgress = false;
              self.p_deactivateWriteBack(remoteTableName);

              if (response.status == 409 && response.error.error_summary.startsWith('path/conflict/file'))
              {
                // Data file doesn't exist on Dropbox
                log.info('dropbox: revision conflict detected for "' + ctx.fnameJournal  + '"');
                ctx.revJournal = 'empty';
                ctx.idJournal = 'empty'
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
  }  // Threshold no rached, write into the journal file
}

// object [global] p_triggerStateMachine
//
// Invoked on timer, runs the state machine for remoteTableName if it
// is state IDLE
function p_triggerStateMachine(objRTables, remoteTableName)
{
  let rtable = objRTables.m_rtables[remoteTableName];

  rtable.m_seconds += g_stateMachineIntervalTickSeconds;

  if (rtable.m_seconds < g_stateMachineIntervalSeconds)
    return;

  rtable.m_seconds = 0;

  log.info(`dropbox: p_triggerStateMachine(${remoteTableName})`);

  // State machine should only be started from IDLE state, verify if
  // it is in IDLE
  if (rtable.m_readStateM.m_curState != 'IDLE')
  {
    ++rtable.m_delayCnt;
    if (rtable.m_delayCnt > 3)
    {
      // We waited for too long for previous to complete, sound the
      // alarm
      utils_ns.domError(`dropbox: p_triggerStateMachine(${remoteTableName}) skipped for too many times`);
      return;
    }

    // Skip the scheduled write
    log.info(`dropbox: p_triggerStateMachine(${remoteTableName}), skipped one state machine run (${rtable.m_delayCnt}/3)`)
    return;
  }

  // Set the state machine in motion to poll remote tables
  rtable.m_readStateM.advance('START_FULL_LOAD');
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

        let now = new Date();
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify() + ', ' +
            utils_ns.dateToStr(now));
      });

  state.add('START_FULL_LOAD', function ()
      {
        //
        // FULL_LOAD: Start sequence for loading updated state from Dropbox
        let now = new Date();
        log.info('dropbox: [' + remoteTableName + '] state ' + state.stringify() + ', ' +
            utils_ns.dateToStr(now));

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
        let tableFName = ctx.profilePath + '/' + baseName;
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
                      + 'rev: ' + response.result.rev + ', size: ' + response.result.size + ', '
                      + 'id: ' + response.result.id);
                  // console.log(response);

                  ctx.freshRevJournal = response.result.rev;
                  ctx.idJournal = response.result.id;
                  state.advance('GET_REV_FSTATE');
                })
            .catch(function(response)
                {
                  if (response.status == 409 && response.error.error_summary.startsWith('path/not_found'))
                  {
                    // Data file doesn't exist on Dropbox
                    log.info('dropbox: NOT FOUND detected for "' + baseName  + '"');
                    ctx.freshRevJournal = 'empty';
                    state.advance('GET_REV_FSTATE');
                  }
                  else
                  {
                    log.error('dropbox: getMetadata for journal "' + baseName + '"');
                    log.error(response);
                    log.error('dropbox: Network error, can\'t continue going back to IDLE')
                    state.advance('IDLE');
                  }
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
        let tableFName = ctx.profilePath + '/' + baseName;
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
                      + 'rev: ' + response.result.rev + ', size: ' + response.result.size);
                  // console.log(response);

                  ctx.freshRevFState = response.result.rev;
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
                    state.advance('LOAD_DATA_JOURNAL');
                  }
                  else
                  {
                    log.error('dropbox: getMetadata for fstate "' + baseName + '"');
                    log.error(response);
                    log.error('dropbox: Network error, can\'t continue going back to IDLE')
                    state.advance('IDLE');
                  }
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
            // Nothing held locally yet
            log.info('dropbox: [' + remoteTableName + '] No locally loaded remote journal (first time to load)');
            shouldLoad = true;
          }
          else
          {
            // We have both remote version AND local version
            if (revJournal == ctx.freshRevJournal)
            {
              // Journal should alredy be in ctx.remoteJournal
              log.info('dropbox: [' + remoteTableName + '] Keep the locally stored journal');

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
                path: ctx.profilePath + '/' + ctx.fnameJournal,
              })
              .then(function(response)
                  {
                    log.info(`dropbox: [${remoteTableName}] filesDownload, journal, rev: ${response.result.rev}`);
                    // console.info(response);

                    // Parse JSON and keep a copy in local ctx
                    let blob = response.result.fileBlob;
                    let reader = new FileReader();
                    reader.addEventListener("loadend", function()
                        {
                          // TODO: test with bad JSON
                          // TODO: Check that essential fields are present
                          // TODO: Check that size makes sense
                          let data = JSON.parse(reader.result);
                          // Store locally new version + journal contents
                          ctx.freshRevJournal = response.result.rev;
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

                    // The error could have 2 sources
                    //
                    // 1: Dropbox error, then we have fields response.error.error_summary
                    // 2: FileReader.readAsText(), then we have response.message
                    let err_msg = '!response.message!'
                    if (response.error !== undefined && response.error.error_summary !== undefined)
                      err_msg = response.error.error_summary
                    else
                      err_msg = response.message;

                    utils_ns.domError("dropbox: filesDownload('" + ctx.fnameJournal + "'), " +
                        "error: " + err_msg);

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
              log.info('dropbox: [' + remoteTableName + '] No new full-state data');

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
              path: ctx.profilePath + '/' + ctx.fnameFState,
            })
            .then(function(response)
                {
                  log.info('dropbox: filesDownload, fstate, rev: ' + response.result.rev);
                  // console.info(response);

                  // In the off-chance that remote rev has changed during
                  // the steps in this state machine
                  ctx.freshRevFState = response.result.rev;

                  // Parse JSON and keep a copy in local ctx
                  let blob = response.result.fileBlob;
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

                  // The error could have 2 sources
                  //
                  // 1: Dropbox error, then we have fields response.error.error_summary
                  // 2: FileReader.readAsText(), then we have response.message
                  let err_msg = '!response.message!'
                  if (response.error !== undefined && response.error.error_summary !== undefined)
                    err_msg = response.error.error_summary
                  else
                    err_msg = response.message;

                  utils_ns.domError("dropbox: filesDownload('" + ctx.fnameJournal + "'), " +
                      "error: " + err_msg);

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
          else
            log.info('dropbox: [' + remoteTableName + '] no new joural data to apply');


          ctx.revJournal = ctx.freshRevJournal;
        }

        //
        // HERE: Place operations to be run prior the end of the state machine

        // Flag that new journal entries can be written to disk
        ctx.journalAcquired = true;

        // To IDLE
        //
        // (This should be the only place in the state machine to
        // advance to IDLE, always the same path!)
        state.advance('IDLE');
      });

  // Set the state machine at initial state 'IDLE'
  state.advance('IDLE');
  return state;
}

// object RTables.writeFullState()
// Overwrites remote tables with a full new state
function writeFullState(tableName, entries, cbDone)
{
  let self = this;

  let ctx = self.m_rtables[tableName].m_ctx;
  // Q: Why not use JSON.stringify() of the array?
  // A: For debug purposes it is better to have our own output with ONE entry per line
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
        path: ctx.profilePath + '/' + ctx.fnameFState,
        mode: writeMode,
        strict_conflict: true,
        autorename: false,
        mute: true
      })
      .then(function(response)
          {
            console.info('RTables.writeFullState[' +
              tableName + '], total dump length: ' + strAll.length + ', ' +
              'prev: ' + strPrevVer + ', new: ' + response.result.rev);

            // Keep track of the new revision of the file on Dropbox
            g_utilsCB.setPref(ctx.prefRevFState, response.result.rev);
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

// Object RTables.p_fileExists()
// Checks if a file exists on Dropbox
//
// Result is delivered via the callbac cbResult()
function p_fileExists(fileName, cbResult)
{
  let self = this;

  // Check if file exists
  g_dbox.filesGetMetadata(
      {
        path: '/' + fileName,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false
      })
      .then(function(response)
          {
            log.info('dropbox: p_fileExists for ' + fileName);
            cbResult(true);
            // console.log(response);
          })
      .catch(function(response)
          {
            if (response.status == 409 && response.error.error_summary.startsWith('path/not_found'))
            {
              // Data file doesn't exist on Dropbox
              log.info('dropbox: p_fileExists, NOT FOUND detected for "' + fileName  + '"');
            }
            else
            {
              let msg = `dropbox: p_fileExists, ${fileName}, error: ${response.status}, summary: ${response.error}`;
              log.error(response);

              utils_ns.domError(msg);
            }
            cbResult(false);
          });
}
RTables.prototype.p_fileExists = p_fileExists;

// Object RTables.p_createFolder()
// Creates a folder if it doesn't exist already
function p_createFolder(folder, cbDone)
{
  let self = this;

  self.p_fileExists(folder, function (folderExists)
      {
        if (folderExists)
        {
          // Nothing to do
          log.info(`dropbox: p_createFolder, ${folder} exists, nothing to do`)
          cbDone(true);
        }
        else
        {
          g_dbox.filesCreateFolderV2(
              {
                path: '/' + folder,
                autorename: false
              })
              .then(function(response)
                  {
                    // console.log(response);
                    log.info('dropbox: RTables.filesCreateFolderV2(' +
                      response.result.metadata.path_display + '), OK');
                    cbDone(true);
                  })
              .catch(function(response)
                  {
                    let msg = `dropbox: createfolderV2, ${folder}, error: ${response.status}, summary: ${response.error}`;
                    log.error(response);

                    utils_ns.domError(msg);

                    // Callback FAILURE
                    cbDone(false);
                  });
        }
      });
}
RTables.prototype.p_createFolder = p_createFolder;

// object g_rtablesActivate
//
// When we have connection to Dropbox:
// 1. Make sure the profile folders are created
// 2. Activate the polling state machine
function g_rtablesActivate()
{
  utils_ns.assert(g_tables != null, "rtable_dbox: No RTables created yet");

  log.info('dropbox: g_rtablesActivate()');

  let self = g_tables;

  // Create folder Profiles if needed
  self.p_createFolder('Profiles/' + self.m_profile, function (folderOK)
      {
        if (!folderOK)
        {
          // TODO: Show a dialog box for error
          log.error('Failed to create Profile folder');
          utils_ns.domError('Failed to create Profile folder');
          return;
        }

        //
        // For each table start the polling state machine
        let tableNames = Object.keys(self.m_rtables);
        for (let i = 0; i < tableNames.length; ++i)
        {
          let remoteTableName = tableNames[i];
          let rentry = self.m_rtables[remoteTableName];

          // Setup the state machine to run on an interval of time
          rentry.m_seconds = 0;
          rentry.m_timerStateM =
              setInterval(p_triggerStateMachine, g_stateMachineIntervalTickSeconds * 1000, self, remoteTableName);

          // Run it the first time in 2 seconds from now
          //
          // (The clock tick IntervalTickSeconds and the total
          // time of 2 minutes is too slow for first load)
          setTimeout(function ()
              {
                  log.info(`dropbox: [${remoteTableName}] first run`)
                  rentry.m_readStateM.advance('START_FULL_LOAD');
              }, 2 * 1000);

          // Table is online
          rentry.m_active = true;
        }
      });
}

// object RTables.RTable [constructor]
//
// The remote tables are instantiated but remain unactive until:
// 1. A connection to Dropbox appears
// 2. The Profile folder is created and ready for use
function RTables(profile, rtables, cbEvents)
{
  let self = this;

  utils_ns.assert(g_tables == null, "rtable_dbox: Only a single global RTables");

  self.m_rtables = {};
  self.m_profile = profile;

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
      profilePath: '/Profiles/' + profile,
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

      journalAcquired: false, // The first time
      revJournal: 'empty',    // Not in yet in remote storage, only in memory
      idJournal: 'empty',     // No file ID acquired yet

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
    rentry.m_timerStateM = null;
    rentry.m_delayCnt = 0;

    // EventQ, one per remote table
    rentry.m_ctx.events =  new utils_ns.EventQ(function (event)
        {
          self.p_eventHandler(self, entry.name, event);
        });

    // Setup the state machine to run on an interval of time
    rentry.m_seconds = 0;
    rentry.m_timerStateM = null;

    //
    // Setup the handler of periodic write operations
    rentry.m_writeBack = null;
    rentry.m_writeBackInProgress = false;
    rentry.m_progressCnt = 0;  // Counts the attempts that pending operation didn't complete

    // Status offline or online
    rentry.m_active = false;
  }

  // Help strict mode detect miss-typed fields
  Object.preventExtensions(this);

  g_tables = self;

  return self;
}

// Invoked upon successful login into Dropbox
//
// Records the Dropbox connection object
function RTablesConnect(_connectionObj, utilsCB)
{
  g_connectionObj = _connectionObj;
  g_dbox = g_connectionObj.dbox_client;
  g_utilsCB = utilsCB;
  g_rtablesActivate();
}

feeds_ns.RTablesConnect = RTablesConnect;
feeds_ns.RTables = RTables;
})();
