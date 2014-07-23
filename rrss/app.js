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

  // Establish compatible indexDB based on the browser
  log.setLevel('info');
  log.info("Obtaining indexDB handler...");

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

  // $feedDisp is the right-hand side panel that displays the contents of rss entries
  var $feedDisp = utils_ns.domFind('#xrss_container');
  self.m_feedDisp = new feeds_ns.FeedDisp($feedDisp);
  // $feedsPanel is the left-hand side panel that display folders and feed titles
  var $feedsPanel = utils_ns.domFind('#xfeeds_list');
  self.m_feedsDir = new feeds_ns.FeedsDir($feedsPanel, self.m_feedDisp);

  self.$d =
  {
    areaLeftPane: utils_ns.domFind('#xleft_pane'),
    btnDropbox: null
  }

  self.m_aboutPanel = new feeds_ns.AboutPanel();

  self.m_commandPaneMap = [
    {
      $leftPaneTriggerArea: utils_ns.domFind('#xcmd_pane_feeds_dir'),
      $rightPaneDispArea: utils_ns.domFind('#xdisp_pane_feeds'),
      handler: self.m_feedsDir,
      isActive: false
    },
    {
      $leftPaneTriggerArea: utils_ns.domFind('#xcmd_pane_about'),
      $rightPaneDispArea: utils_ns.domFind('#xdisp_pane_about'),
      handler: self.m_aboutPanel,
      isActive: false
    }
  ];

  // Activate Feeds display
  self.p_activatePane(0);

  self.$d.areaLeftPane.on("click", function (e)
    {
      return self.p_handleLeftPaneClick(e);
    });

  // TODO: move all dropbox stuff into a devoted handler object
  // and a separate file
  self.m_dropBoxClient = new Dropbox.Client({key: 'w1ghid3yiohsa69'});
  self.m_dropBoxClient.authDriver(new Dropbox.AuthDriver.ChromeExtension(
    {
      receiverPath: 'rrss/chrome_oauth_receiver.html'
    }));

  self.$d.btnDropbox = utils_ns.domFind('#xdropbox');
  self.$d.userDropbox = utils_ns.domFind('#xdropbox_user');
  self.m_user_email = '';
  self.m_user_name = '';
  self.p_dboxSetLoginButton();

  // Try to finish OAuth authorization.
  self.m_authenticated = false;
  self.m_dropBoxClient.authenticate({interactive: false},
    function (error, client)
    {
      self.p_dboxConnectCB(error, client);
    });

  self.$d.btnDropbox.on('click',
    function (e)
    {
      self.p_dboxLoginLogout();
    });

  return this;
}

// object App.p_activatePane()
// Activate one object into the right-hand side area (Feeds, About, etc.)
function p_activatePane(index)
{
  var self = this;

  if (self.m_commandPaneMap[index].isActive)
  {
    log.info('pane area ' + index + ': already active');
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
  log.info('activate pane area ' + index);
}
App.prototype.p_activatePane = p_activatePane;

// object App.p_handleLeftPaneClick()
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

    self.p_activatePane(i);

    log.info('pane area ' + i);
  }

  return true;
}
App.prototype.p_handleLeftPaneClick = p_handleLeftPaneClick;

var client = null;

// object App.p_dboxSetLoginButton()
function p_dboxSetLoginButton()
{
  var self = this;

  if (self.m_authenticated)
  {
    if (false)
    {
      // TODO: remove, quick demo, file access
      self.m_dropBoxClient.writeFile('hello.txt', 'Hello, World!', function () {
          alert('File written!');
      });
    }

    self.$d.btnDropbox.text('Logout \u2192');
    if (self.m_user_email != '')
      self.$d.userDropbox.text('(' + self.m_user_email + ')');
    else
      self.$d.userDropbox.empty();
  }
  else
  {
    self.$d.btnDropbox.text('Login (Dropbox)');
    self.$d.userDropbox.empty();
  }
}
App.prototype.p_dboxSetLoginButton = p_dboxSetLoginButton;

// object App.p_dboxGetAccountInfo()
function p_dboxGetAccountInfo()
{
  var self = this;

  self.m_dropBoxClient.getAccountInfo({httpCache: true},
    function(error, accountInfo, accountInfoData)
    {
      if (error)
        console.log('get_acc1: error ' + error);
      else
      {
        self.m_user_name = accountInfoData.display_name;
        self.m_user_email = accountInfoData.email;
        console.log('get_acc1: accountInfo OK, (' + accountInfoData.email + ')');
        self.p_dboxSetLoginButton();
      }
    });
}
App.prototype.p_dboxGetAccountInfo = p_dboxGetAccountInfo;

// object App.p_dboxConnectCB()
// A callback. Completes connection to Dropbox.
function p_dboxConnectCB(error, client)
{
  var self = this;

  if (error)
  {
      console.log('auth_pass1: authentication error: ' + error);
  }
  else
  {
    console.log('auth_pass1: authenticated1');
    self.m_dropBoxClient = client;
    if (self.m_dropBoxClient.isAuthenticated())
    {
      self.m_authenticated = true;
      console.log('auth_pass1: OK');
      feeds_ns.RTableInit(self.m_dropBoxClient,
        function(code)
        {
          if (code == 0)  // RTable init ok
          {
            console.log("RTable init OK");
            self.p_dboxSetLoginButton();
            self.p_dboxGetAccountInfo();
            self.m_feedsDir.remoteStoreConnected();
          }
          else
          {
            console.log("RTable init failed");
            self.p_dboxLoginLogout();
          }
        });
    }
    else
    {
      console.log('auth_pass1: NO');
      self.p_dboxSetLoginButton();
    }
  }
}
App.prototype.p_dboxConnectCB = p_dboxConnectCB;

// object App.p_dboxLoginLogout
// Handles click on Login/Logout button
function p_dboxLoginLogout()
{
  var self = this;

  if (self.m_authenticated)
  {
    self.m_authenticated = false;
    self.m_user_name = '';
    self.m_user_email = '';
    self.p_dboxSetLoginButton();

    self.m_dropBoxClient.signOut(false,
      function(error)
      {
        if (error)
           console.log('sign_out1: error ' + error);
        else
           console.log('sign_out1: OK');
     });
  }
  else
  {
    console.log("auth2: start");
    self.m_dropBoxClient.authenticate({interactive: true},
      function (error, client)
      {
        console.log("auth2: callback");
        self.m_dboxConnectCB(error, client);
      });
  }
}
App.prototype.p_dboxLoginLogout = p_dboxLoginLogout;

// object AboutPanel [constructor]
function AboutPanel()
{
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

  return this;
}

// object AboutPanel.onFocusLost
function onFocusLostAbout()
{
  self.$d.entryAbout.toggleClass('selected', false);
}
AboutPanel.prototype.onFocusLost = onFocusLostAbout;

// object AboutPanel.onFocus
function onFocusAbout()
{
  self.$d.entryAbout.toggleClass('selected', true);
}
AboutPanel.prototype.onFocus = onFocusAbout;

var app = null;
feeds_ns.app = null;

$(document).ready(function()
    {
      app = new App();
      feeds_ns.app = app;
    });

feeds_ns.AboutPanel = AboutPanel;
})();
