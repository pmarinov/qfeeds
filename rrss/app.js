// app.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
{
  feeds_ns = {};
}

(function ()
{

"use strict";

// object App.App [constructor]
function App()
{
  var self = this;
  var $popupErrorDlg = utils_ns.domFind('#xerror_popup');
  var $popupErrorMsg = utils_ns.domFind('#xerror_pop_msg');

  var m_oldOnError = window.onerror;
  // Override previous handler.
  window.onerror = function(errorMsg, url, lineNumber, column, errorObj)
      {
        var stripRe = new RegExp('(chrome-extension:..[a-z]*\/)(.*)', 'g');
        var strippedUrl = url.replace(stripRe, '$2');
        var strippedStack = errorObj.stack.toString().replace(stripRe, '$2');
        var errorMsgHTML = '<i>Plase consider making a bug report together with this information.</i><br/>' +
              '<hr>' +
              '<span id="xerror_msg_text"></span>' +
              '<br/><br/>' +
              '<b>source file:</b> ' + strippedUrl + ':' + lineNumber + ':' + column + '<br/>' +
              '<b>stack:</b> ' + '<br/>' +
              '<pre style="font-size: 80%">' + strippedStack + '</pre>';

        $popupErrorMsg.html(errorMsgHTML);
        $('#xerror_msg_text').text(errorMsg);

        $popupErrorDlg.modal('show');

        if (self.m_oldOnError)  // Call previous handler
          return m_oldOnError(errorMsg, url, lineNumber);

        // Just let default handler run.
        return false;
      }

  // Establish compatible indexDB based on the browser
  log.setLevel('info');
  log.info("app: Obtaining indexDB handler...");

  // TODO: move this into object Feeds!
  // In the following line, you should include the prefixes of implementations you want to test.
  window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
  // DON'T use "var indexedDB = ..." if you're not in a function.
  // Moreover, you may need references to some window.IDB* objects:
  window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
  window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
  // (Mozilla has never prefixed these objects, so we don't need window.mozIDB*)
  if (!window.indexedDB)
  {
      window.alert("Your browser doesn't support a stable version of IndexedDB.");
  }

  self.$d =
  {
    // feedDisp is the right-hand side panel that displays the contents of rss entries
    feedDisp: utils_ns.domFind('#xrss_container'),
    // feedsPanel is the left-hand side panel that display folders and feed titles
    feedsPanel: utils_ns.domFind('#xfeeds_list'),
    // DOM elements fro GDrive operations and status
    syncProgress: utils_ns.domFind('#xsync_progress'),
    syncProgressHolder: utils_ns.domFind('#xsync_progress_holder'),
    btnGDrive: utils_ns.domFind('#xgdrive'),
    userGDrive: utils_ns.domFind('#xgoogle_user')
  }

  self.m_feedDisp = null;
  self.m_feedsDir = null;
  self.m_feedsDB = null;

  self.m_initSeq = [];
  self.m_initCnt = 0;
  self.m_initSeq.push(function()
      {
          self.m_panelMng = new feeds_ns.PanelMng();

          self.m_feedDisp = new feeds_ns.FeedDisp(self.$d.feedDisp);
          self.m_feedsDir = new feeds_ns.FeedsDir(self.$d.feedsPanel, self.m_feedDisp, self.m_panelMng);
          self.p_initSeqNext();
      });
  self.m_initSeq.push(function()
      {
          // Setup object for work on IndexedDB
          self.m_feedsDB = new feeds_ns.Feeds();
          // Connect feedsDir callbacks into feedsDB so that data can be displayed via these callback
          self.m_feedsDir.connectToFeedsDb(self.m_feedsDB);
          // Open IndexedDB and load all feeds (object type RSSHeader) in memory
          // Via call-backs this will also list the feeds and folders in
          // the panel for feeds navigation (left-hand-side)
          self.m_feedsDB.dbOpen(function ()
              {
                  self.p_initSeqNext();
              });
      });
  self.m_initSeq.push(function()
      {
          // Load all preferences from the IndexedDB into cache
          self.m_feedsDB.prefReadAll(function ()
              {
                  self.p_initSeqNext();
              });
      });
  self.m_initSeq.push(function()
      {
          // Load all feeds data from the IndexedDB
          self.m_feedsDB.dbLoad(function ()
              {
                  self.p_initSeqNext();
              });
      });
  self.m_initSeq.push(function()
      {
          self.m_panelAbout = new feeds_ns.PanelAbout();
          self.m_panelImportOpml = new feeds_ns.FeedsImport(self.m_feedsDB, self.m_feedsDir, self.m_panelMng);

          self.m_panelMng.setMenuEntryHandler('xcmd_pane_feeds_dir', self.m_feedsDir);
          self.m_panelMng.setMenuEntryHandler('ximport_opml', self.m_panelImportOpml);
          self.m_panelMng.setMenuEntryHandler('xcmd_pane_about', self.m_panelAbout);

          self.m_panelMng.p_activatePane(0);  // Activate feeds display

          self.p_initSeqNext();
      });
  self.m_initSeq.push(function()
      {
        // Now connect to Dropbox
        // self.m_connectDropbox = new feeds_ns.ConnectDBox(self.p_getConnectDBoxCBHandlers());
        // Now connect to Google Drive
        gapi.load("drive-realtime,drive-share", function()
            {
              // callback: API Done Loading
              $('#xgdrive').on('click', function ()
                  {
                    chrome.identity.getAuthToken({ 'interactive': true }, function(accessToken)
                        {
                          if (chrome.runtime.lastError)
                          {
                            //callback(chrome.runtime.lastError);
                            log.error(chrome.runtime.lastError);
                            return;
                          }
                          chrome.identity.getProfileUserInfo(function(profileInfo)
                              {
                                self.$d.btnGDrive.text('Logout \u2192');
                                self.$d.userGDrive.text(profileInfo.email)
                              });
                          log.info('Google API Access token: ' + accessToken);
                          feeds_ns.RTablesInit(accessToken, function()
                              {
                                self.m_feedsDir.remoteStoreConnected();
                              });
                        });
                  });
            });
          self.p_initSeqNext();
      });
  self.m_initSeq.push(function()
      {
          Object.preventExtensions(this);
          self.p_initSeqNext();
      });

  // Kick off the init steps
  self.p_initSeqNext();

  return this;
}

// object App.p_initSeqNext
function p_initSeqNext()
{
  var self = this;

  if (self.m_initCnt > 0)
    log.info('app: end of init step ' + (self.m_initCnt - 1));

  if (self.m_initCnt >= self.m_initSeq.length)
    return;  // All init steps are done

  setTimeout(function ()
  {
      log.info('app: start of init step ' + self.m_initCnt);
      ++self.m_initCnt;
      self.m_initSeq[self.m_initCnt - 1]();
  }, 0);  // Delay 0, just yield
}
App.prototype.p_initSeqNext = p_initSeqNext;

// object App.p_getConnectDBoxCBHandlers()
function p_getConnectDBoxCBHandlers()
{
  var self = this;

  var connectDBoxCB =
  {
    // If user logins into Dropbox this function is called
    // when access object is ready
    onDBoxClientReady: function(clientDBox)
        {
          feeds_ns.RTableInit(clientDBox,
            function(code)
            {
              if (code == 0)  // RTable init ok
              {
                console.log("RTable init OK");
                self.m_feedsDir.remoteStoreConnected();
              }
              else
              {
                console.log("RTable init failed");
                self.m_connectDropbox.dboxLoginLogout();  // Logout
              }
            });
        },

    onDBoxProgress: function(percent)
        {
          if (percent == 0)  // start
            self.$d.syncProgressHolder.toggleClass('hide', false);

          self.$d.syncProgress.attr('style', 'width: ' + percent + '%;');

          if (percent == 100)  // end
          {
            // Postglow for 1 second :-)
            setTimeout(function ()
                {
                  self.$d.syncProgressHolder.toggleClass('hide', true);
                }, 1 * 1000);
          }
        }
  };

  return connectDBoxCB;
}
App.prototype.p_getConnectDBoxCBHandlers = p_getConnectDBoxCBHandlers;

// object PanelMng.p_activatePane()
// Activate one object into the right-hand side area (Feeds, About, etc.)
function p_activatePane(index)
{
  var self = this;

  if (self.m_commandPaneMap[index].isActive)
  {
    log.info('app: pane area ' + index + ': already active');
    return;
  }

  var k = 0;
  // Find the active pane and turn it to hidden
  for (k = 0; k < self.m_commandPaneMap.length; ++k)
  {
    if (self.m_commandPaneMap[k].isActive)
    {
      self.m_commandPaneMap[k].$rightPaneDispArea.toggleClass('hide', true);
      self.m_commandPaneMap[k].handler.onFocusLost();
    }
    self.m_commandPaneMap[k].isActive = false;
  }

  // Unhide new active pane
  self.m_commandPaneMap[index].$rightPaneDispArea.toggleClass('hide', false);
  self.m_commandPaneMap[index].handler.onFocus();
  self.m_commandPaneMap[index].isActive = true;
  log.info('app: activate pane area ' + index);
}
PanelMng.prototype.p_activatePane = p_activatePane;

// object PanelMng.p_handleLeftPaneClick()
// TODO: describe correspondence between left and right panes
function p_handleLeftPaneClick(ev)
{
  var self = this;

  var i = 0;
  for (i = 0; i < self.m_commandPaneMap.length; ++i)
  {
    // Clicked on item _i_?
    if (!utils_ns.clickIsInside(self.m_commandPaneMap[i].$leftPaneTriggerArea, ev.pageX, ev.pageY))
      continue;

    if (self.m_commandPaneMap[i].isEnabled)
    {
      self.p_activatePane(i);
      log.info('app: pane area ' + i + ' is enabled');
    }

    return true;
  }

  return false;
}
PanelMng.prototype.p_handleLeftPaneClick = p_handleLeftPaneClick;

// object PanelMng.enableMenuEntry()
// Enables/Disables menu entries
function enableMenuEntry(entryDomId, isEnabled)
{
  var self = this;

  var actionStr = 'Enable';
  if (!isEnabled)
    actionStr = 'Disable';

  var i = 0;
  var e = null;
  for (i = 0; i < self.m_commandPaneMap.length; ++i)
  {
    e = self.m_commandPaneMap[i];
    if(jQuery(e.$leftPaneTriggerArea).attr('id') != entryDomId)
      continue;

    jQuery(e.$leftPaneTriggerArea).toggleClass('disabled', !isEnabled);
    e.isEnabled = isEnabled;

    log.info('app: ' + actionStr + ' pane area ' + entryDomId);
    return;
  }

  utils_ns.assert(false, 'enableMenuEntry: invalid DOM id ' + entryDomId);
}
PanelMng.prototype.enableMenuEntry = enableMenuEntry;

// object PanelMng.setMenuEntryHandler()
// Sets handler for activation/deactivation of right-hand panel for
// a menu entry
function setMenuEntryHandler(entryDomId, handler)
{
  var self = this;

  var i = 0;
  var e = null;
  for (i = 0; i < self.m_commandPaneMap.length; ++i)
  {
    e = self.m_commandPaneMap[i];
    if(jQuery(e.$leftPaneTriggerArea).attr('id') != entryDomId)
      continue;

    e.handler = handler;
    log.info('app: Set handler for pane area ' + entryDomId);
    return;
  }

  utils_ns.assert(false, 'setMenuEntryHandler: invalid DOM id ' + entryDomId);
}
PanelMng.prototype.setMenuEntryHandler = setMenuEntryHandler;

// object PanelMng.PanelMng() [constructor]
// Panel manager
//
// Handles commands pannel on the left-hand side and activates data panels
// on the right-hand side
function PanelMng()
{
  var self = this;

  self.m_areaLeftPane = utils_ns.domFind('#xleft_pane');

  var i = 0;
  self.m_commandPaneMap = [
    {
      $leftPaneTriggerArea: utils_ns.domFind('#xcmd_pane_feeds_dir'),
      $rightPaneDispArea: utils_ns.domFind('#xdisp_pane_feeds'),
      handler: null,
      isActive: false,
      isEnabled: true
    },
    {
      $leftPaneTriggerArea: utils_ns.domFind('#ximport_opml'),
      $rightPaneDispArea: utils_ns.domFind('#xdisp_pane_import_opml'),
      handler: null,
      isActive: false,
      isDisabled: false,
      isEnabled: false  // Enabled after IndexedDB is loaded
    },
    {
      $leftPaneTriggerArea: utils_ns.domFind('#xcmd_pane_about'),
      $rightPaneDispArea: utils_ns.domFind('#xdisp_pane_about'),
      handler: null,
      isActive: false,
      isEnabled: true
    }
  ];
  for(i = 0; i < self.m_commandPaneMap.length; ++i)
    Object.preventExtensions(self.m_commandPaneMap[i]);

  self.m_areaLeftPane.on("click", function (e)
    {
      return self.p_handleLeftPaneClick(e);
    });

  Object.preventExtensions(this);

  return this;
}

// object PanelAbout [constructor]
function PanelAbout()
{
  var self = this;

  self.$d =
  {
    entryAbout: utils_ns.domFind('#xcmd_pane_about'),
    btnSeeLicense: utils_ns.domFind('#xsee_license'),
    btnCloseLicense: utils_ns.domFind('#xclose_license'),
    areaLicense: utils_ns.domFind('#xarea_license'),
    areaAboutExtra: utils_ns.domFind('#xarea_about_extra')
  };

  self.$d.btnSeeLicense.on("click",
    function ()
    {
      self.$d.btnCloseLicense.toggleClass("hide", false);
      self.$d.btnSeeLicense.toggleClass("hide", true);
      self.$d.areaAboutExtra.toggleClass("hide", true);
      self.$d.areaLicense.toggleClass("hide", false);
    });

  self.$d.btnCloseLicense.on("click",
    function ()
    {
      self.$d.btnCloseLicense.toggleClass("hide", true);
      self.$d.btnSeeLicense.toggleClass("hide", false);
      self.$d.areaAboutExtra.toggleClass("hide", false);
      self.$d.areaLicense.toggleClass("hide", true);
    });

  Object.preventExtensions(this);

  return this;
}

// object PanelAbout.onFocusLost
function onFocusLostAbout()
{
  var self = this;

  self.$d.entryAbout.toggleClass('selected', false);
}
PanelAbout.prototype.onFocusLost = onFocusLostAbout;

// object PanelAbout.onFocus
function onFocusAbout()
{
  var self = this;

  self.$d.entryAbout.toggleClass('selected', true);
}
PanelAbout.prototype.onFocus = onFocusAbout;

var app = null;
feeds_ns.app = null;

$(document).ready(function()
    {
      app = new App();
      feeds_ns.app = app;
    });

feeds_ns.PanelMng = PanelMng;
feeds_ns.PanelAbout = PanelAbout;
})();
