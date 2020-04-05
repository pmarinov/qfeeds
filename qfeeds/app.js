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
  var subscriptionReqList = [];  // App started via a subscription request?

  // When an extension is started we need to check if the background
  // page has any feeds pending for display and subscription
  chrome.runtime.sendMessage({msg: 'getFeedsList'}, function(response)
      {
        console.log('app: message response from "background.js"')
        console.log(response.feedData);
          if (response.feedData === undefined)
            return;
          if (response.feedData.length < 1)
            return;
          subscriptionReqList = response.feedData;
      });
  // After that, permanently wait for more feeds send by background
  // page. The cases are that user goes to a page and click the
  // extension icon, we have to behave as if the user's intention was
  // to add feeds
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse)
      {
        if (request.msg == 'feedsActivated')
        {
          console.log('app: message from "background.js"')
          console.log(request.feedData);
          if (request.feedData === undefined)
            return;
          if (request.feedData.length < 1)
            return;
          self.m_feedsDir.p_feedView(request.feedData[0].href);
        }
      });

  var m_oldOnError = window.onerror;
  // Override previous handler.
  window.onerror = function(errorMsg, url, lineNumber, column, errorObj)
      {
        var stripRe = new RegExp('(chrome-extension:..[a-z]*\/)(.*)', 'g');
        var strippedUrl = url.replace(stripRe, '$2');
        var strippedStack = errorObj.stack.toString().replace(stripRe, '$2');
        var errorMsgHTML = '<i>Please consider ' +
              '<a href="https://github.com/pmarinov/rrss/issues" target="_blank">making a bug report</a> ' +
              'together with this information.</i><br/>' +
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
  // log.setLevel('info');
  log.setLevel('warn');
  log.info("app: Obtaining indexDB handler...");

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
    syncProgressHolder: utils_ns.domFind('#xsync_progress_holder')
  }

  self.m_feedDisp = null;
  self.m_feedsDir = null;
  self.m_feedsDB = null;
  self.m_gdriveConnect = null;

  self.m_initSeq = [];  // A vector of init steps executed in order
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
        // Open IndexedDB
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
              self.p_setDefaultPref();  // Set default values for preferences (if this is first load)
              self.p_initSeqNext();
            });
      });
  self.m_initSeq.push(function()
      {
        // Load all feeds data from the IndexedDB (object type RSSHeader)
        // Via call-backs this will also list the feeds and folders in
        // the panel for feeds navigation (left-hand-side)
        self.m_feedsDB.dbLoad(function ()
            {
              var delay = 5;  // Delay start of fetch loop to give priority to initial GDrive sync
              // Don't start fetch loop immediately if screen for New Feed Subscription was requested upon startup
              if (subscriptionReqList.length > 0)
                delay = 120;  // 2 min delay in case of subscription req
              self.m_feedsDB.suspendFetchLoop(false, delay);  // Resume fetch loop, start fetching now

              self.p_initSeqNext();
            });
      });
  self.m_initSeq.push(function()
      {
        // Setup objects for the screen
        self.m_panelAbout = new feeds_ns.PanelAbout();
        self.m_panelStats = new feeds_ns.PanelStats(self.m_feedsDB);
        self.m_panelImportOpml = new feeds_ns.FeedsImport(self.m_feedsDB, self.m_feedsDir, self.m_panelMng);

        self.m_panelMng.setMenuEntryHandler('xcmd_pane_feeds_dir', self.m_feedsDir);
        self.m_panelMng.setMenuEntryHandler('ximport_opml', self.m_panelImportOpml);
        self.m_panelMng.setMenuEntryHandler('xcmd_pane_stats', self.m_panelStats);
        self.m_panelMng.setMenuEntryHandler('xcmd_pane_about', self.m_panelAbout);

        self.m_panelMng.p_activatePane(0);  // Activate feeds display

        self.p_initSeqNext();
      });
  self.m_initSeq.push(function()
      {
        // Now connect to Dropbox
        // self.m_connectDropbox = new feeds_ns.ConnectDBox(self.p_getConnectDBoxCBHandlers());
        // Now connect to Google Drive
        // var cb = self.p_getConnectGDriveHandlers();
        // var startWithLoggedIn = self.m_feedsDB.prefGet("m_local.app.logged_in");
        // log.info('app: startWithLoggedIn = ' + startWithLoggedIn);
        // self.m_gdriveConnect = new feeds_ns.ConnectGDrive(cb, startWithLoggedIn);
        self.p_initSeqNext();
      });
  self.m_initSeq.push(function()
      {
        if (subscriptionReqList.length > 0)  // Subscription requested upon startup?
          self.m_feedsDir.p_feedView(subscriptionReqList[0].href);
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
      var nextStep = self.m_initSeq[self.m_initCnt - 1];
      nextStep();
  }, 0);  // Delay 0, just yield
}
App.prototype.p_initSeqNext = p_initSeqNext;

// object App.p_setDefaultPref()
function p_setDefaultPref()
{
  var self = this;
  var prefs = self.m_feedsDB.prefGetAll();

  // Keys that start with m_local stay only on the local machine
  if (prefs["m_local.app.logged_in"] === undefined)
    self.m_feedsDB.prefSet("m_local.app.logged_in", false);
}
App.prototype.p_setDefaultPref = p_setDefaultPref;

// object App.p_getConnectGDriveHandlers()
// A bridge between GDrive status and other elements (UI or Database)
function p_getConnectGDriveHandlers()
{
  var self = this;

  var connectGDriveCB =
  {
    // If user logins into Dropbox this function is called
    // when access object is ready
    onClientReady: function(code, accessToken, displayProgress)
        {
          if (code == 0)
          {
            feeds_ns.RTablesInit(accessToken, function()
                {
                  feeds_ns.RTablesAddListenerReconnect(function ()
                      {
                        // event: rtable_gdrive needs new access token
                        self.m_gdriveConnect.gdriveRefreshToken(function (newToken)
                            {
                              feeds_ns.RTablesSetAccessToken(newToken);
                            });
                      });

                  self.m_feedsDir.remoteStoreConnected(displayProgress);
                },
                displayProgress);
          }
        },

    // Display login progress indicator
    onProgress: function(percent)
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
        },

    // Store preferences
    setPref: function(pref, value)
        {
          self.m_feedsDB.prefSet("m_local.app.logged_in", value);
        },
  };

  return connectGDriveCB;
}
App.prototype.p_getConnectGDriveHandlers = p_getConnectGDriveHandlers;

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
    },
    {
      $leftPaneTriggerArea: utils_ns.domFind('#xcmd_pane_stats'),
      $rightPaneDispArea: utils_ns.domFind('#xdisp_pane_stats'),
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

// object PanelStats [constructor]
function PanelStats(feedsDB)
{
  var self = this;

  self.$d =
  {
    entryStats: utils_ns.domFind('#xcmd_pane_stats'),
    origGroupTitle: utils_ns.domFind('.xstats_group_title'),
    origStatsEntry: utils_ns.domFind('.xstats_entry'),
    dispContainer: utils_ns.domFind('#xstats_group_container'),
    dispList: [] 
  };
  self.m_feedsDB = feedsDB;

  Object.preventExtensions(this);

  return this;
}

// object PanelStats.onFocusLost
function onFocusLostStats()
{
  var self = this;

  self.$d.entryStats.toggleClass('selected', false);
}
PanelStats.prototype.onFocusLost = onFocusLostStats;

// object PanelStats.onFocus
function onFocusStats()
{
  var self = this;

  self.$d.entryStats.toggleClass('selected', true);

  // Empty the container
  self.$d.dispContainer.html('');

  var $g = null;
  var $e = null;
  var k = '';
  var v = '';
  var groups = 0;
  var i = 0;
  var stats = self.m_feedsDB.getStats();
  for (groups = 0; groups < stats.length; ++groups)
  {
    $g = $(self.$d.origGroupTitle).clone();
    $g.text(stats[groups].groupName);
    self.$d.dispContainer.append($g);
    for (i = 0; i < stats[groups].values.length; ++i)
    {
      $e = $(self.$d.origStatsEntry).clone();
      k = stats[groups].values[i].name;
      v = stats[groups].values[i].value;
      $e.text(k + ': ' + v);
      self.$d.dispContainer.append($e);
    }
  }

}
PanelStats.prototype.onFocus = onFocusStats;

var app = null;
feeds_ns.app = null;

$(document).ready(function()
    {
      app = new App();
      feeds_ns.app = app;
    });

feeds_ns.PanelMng = PanelMng;
feeds_ns.PanelStats = PanelStats;
feeds_ns.PanelAbout = PanelAbout;
})();
