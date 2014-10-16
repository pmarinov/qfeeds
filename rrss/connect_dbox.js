// connect_dbox.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Object for management of connection (login/logout) to Dropbox
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
{
  feeds_ns = {};
}

(function ()
{
"use strict";

// object ConnectDBox.ConnectDBox [constructor]
// Connect to Dropbox
// - Connects to Dropbox is user is already authenticated
// - Handle Login/Logout button
// - Shows user info and progress
function ConnectDBox(cb)
{
  var self = this;

  self.$d =
  {
    btnDropbox: utils_ns.domFind('#xdropbox'),
    userDropbox: utils_ns.domFind('#xdropbox_user')
  };

  // Callback handlers
  self.m_cb = cb;

  // progress 0%
  self.m_cb.onDBoxProgress(0);

  self.m_user_email = '';
  self.m_user_name = '';

  self.m_dropBoxClient = new Dropbox.Client({key: 'w1ghid3yiohsa69'});
  self.m_dropBoxClient.authDriver(new Dropbox.AuthDriver.ChromeExtension(
    {
      receiverPath: 'rrss/chrome_oauth_receiver.html'
    }));

  self.p_dboxSetLoginButton();

  // Try to finish OAuth authorization.
  self.m_authenticated = false;

  // progress 20%
  self.m_cb.onDBoxProgress(20);
  self.m_dropBoxClient.authenticate({interactive: false},
    function (error, client)
    {
      // progress 60%
      self.m_cb.onDBoxProgress(60);
      self.p_dboxConnectCB(error, client);
    });

  self.$d.btnDropbox.on('click',
    function (e)
    {
      self.dboxLoginLogout();
    });
}

// object ConnectDBox.p_dboxConnectCB()
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
      // progress 80%
      self.m_cb.onDBoxProgress(80);
      self.m_authenticated = true;
      console.log('auth_pass1: OK');
      self.m_cb.onDBoxClientReady(self.m_dropBoxClient);
      self.p_dboxSetLoginButton();
      self.p_dboxGetAccountInfo();
    }
    else
    {
      console.log('auth_pass1: NO');
      self.p_dboxSetLoginButton();
    }
  }
}
ConnectDBox.prototype.p_dboxConnectCB = p_dboxConnectCB;

// object ConnectDBox.p_dboxGetAccountInfo()
function p_dboxGetAccountInfo()
{
  var self = this;

  self.m_dropBoxClient.getAccountInfo({httpCache: true},
    function(error, accountInfo, accountInfoData)
    {
      // progress 100%
      self.m_cb.onDBoxProgress(100);
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
ConnectDBox.prototype.p_dboxGetAccountInfo = p_dboxGetAccountInfo;

// object ConnectDBox.p_dboxSetLoginButton()
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
      self.$d.userDropbox.text('(Connecting...)');
  }
  else
  {
    self.$d.btnDropbox.text('Login (Dropbox)');
    self.$d.userDropbox.empty();
  }
}
ConnectDBox.prototype.p_dboxSetLoginButton = p_dboxSetLoginButton;

// object ConnectDBox.dboxLoginLogout
// Handles click on Login/Logout button
function dboxLoginLogout()
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
        self.p_dboxConnectCB(error, client);
      });
  }
}
ConnectDBox.prototype.dboxLoginLogout = dboxLoginLogout;

feeds_ns.ConnectDBox = ConnectDBox;
})();
