// connect_dbox.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2018, Peter Marinov and Contributors
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
// - Connects to Dropbox if user is already authenticated
// - Handle Login/Logout button
// - Shows user info
// - Keeps Dropbox API access token
function ConnectDBox(cb, startWithLoggedIn)
{
  var self = this;

  self.$d =
  {
    btnDropbox: utils_ns.domFind('#xgdrive'),
    userDropbox: utils_ns.domFind('#xgoogle_user')
  };

  // Callback handlers
  self.m_cb = cb;

  self.m_user_email = '';
  self.m_user_name = '';

  self.m_client = null;
  self.m_rawToken = null;
  self.m_authToken = null;
  self.m_accountID = null;

  // Local storage key to store the token
  self.m_dboxTokenKey = 'dropbox.token';

  // If we have the token already in localStorage use it
  if (startWithLoggedIn)
  {
    // Activate the token only after the object ConnectDBox is created
    setTimeout(function ()
    {
      self.m_rawToken = localStorage.getItem(self.m_dboxTokenKey);
      if (self.m_rawToken != null)
      {
        self.p_parseToken();
        self.p_setToken();
      }
    }, 0);  // Delay 0, just yield
  };

  self.p_dboxSetLoginButton();

  // Verify connection and set this flag
  self.m_authenticated = false;

  // Keep track of which new tab was opened for Dropbox to login the user
  // Close it once the token is ours
  self.m_authenticationTab = -1;

  // Login/Logout button
  self.$d.btnDropbox.on('click',
    function (e)
    {
      self.dboxLoginLogout();
    });

  // Plug to message listener hook for completion of OAuth's UI interaction
  self.m_cb.addToHookAuthCompleted(function(token)
    {
      p_completeOAuth(self, token);
    });

  Object.preventExtensions(this);
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
    self.m_client = client;
    if (self.m_client.isAuthenticated())
    {
      // progress 80%
      self.m_cb.onDBoxProgress(80);
      self.m_authenticated = true;
      console.log('auth_pass1: OK');
      self.m_cb.onDBoxClientReady(self.m_client);
      self.p_dboxSetLoginButton();
      self.p_dboxGetAccountInfo();
    }
    else
    {
      self.m_cb.onDBoxProgress(100);
      console.log('auth_pass1: NO');
      self.p_dboxSetLoginButton();
    }
  }
}
ConnectDBox.prototype.p_dboxConnectCB = p_dboxConnectCB;

// object ConnectDBox.p_dboxGetAccountInfo()
function p_dboxGetAccountInfo(cb)
{
  let self = this;

  self.m_client.usersGetCurrentAccount()
      .then(function(response)
      {
        self.m_user_name = response.display_name;
        self.m_user_email = response.email;
        cb(1);
      })
      .catch(function(error)
      {
        log.error('dropbox: getAccountInfo:');
        log.error(error);
        cb(0);
      });
}
ConnectDBox.prototype.p_dboxGetAccountInfo = p_dboxGetAccountInfo;

// object ConnectDBox.p_dboxSetLoginButton()
function p_dboxSetLoginButton()
{
  var self = this;

  if (self.m_authenticated)
  {
    self.$d.btnDropbox.text('Logout \u2192');
    self.$d.userDropbox.text('(' + self.m_user_email + ')');
  }
  else
  {
    self.$d.btnDropbox.text('Login (Dropbox)');
    self.$d.userDropbox.empty();
  }
}
ConnectDBox.prototype.p_dboxSetLoginButton = p_dboxSetLoginButton;

// object ConnectDBox.p_parseToken
// Parses `m_rawToken'
// Example string:
// #access_token=40hlw...&token_type=bearer&state=zzclient&uid=118...\
// &account_id=dbid%3AAABBxNhMU...
function p_parseToken()
{
  var self = this;

  var i = 0;
  var c = self.m_rawToken.split('&');
  var entry = '';
  for (i = 0; i < c.length; ++i)
  {
    entry = c[i];

    if (entry.startsWith('#access_token='))
      self.m_authToken = entry.replace('#access_token=', '');

    if (entry.startsWith('account_id='))
      self.m_accountID = decodeURI(entry.replace('account_id=', ''));
  }
}
ConnectDBox.prototype.p_parseToken = p_parseToken;

// object ConnectDBox.p_setLoggedOut
function p_setLoggedOut()
{
  let self = this;

  self.m_authenticated = false;
  self.m_rawToken = null;
  self.m_authToken = null;
  self.m_accountID = null;
  storage.removeItem(m_dboxTokenKey);
}
ConnectDBox.prototype.p_setLoggedOut = p_setLoggedOut;

// object ConnectDBox.p_verifyLoginState
// Verify if Dropbox connection is good by obtaining user info
function p_verifyLoginState()
{
  let self = this;

  self.p_dboxGetAccountInfo(function(status)
      {
        if (status == 1)
        {
          log.info('dropbox: login good.');
          self.m_authenticated = true;
          self.m_cb.onClientReady(0, self.m_authToken, function(progress)
              {
                self.m_cb.onProgress(progress);
              });
        }
        else
          self.p_setLoggedOut();

        self.p_dboxSetLoginButton();
      });
}
ConnectDBox.prototype.p_verifyLoginState = p_verifyLoginState;

// object ConnectDBox.p_setToken
function p_setToken()
{
  let self = this;

  const APIKEY = '1xjfqq4b6gvpsq8';
  self.m_client = new window.Dropbox.Dropbox(
      {
        accessToken: self.m_authToken,
        clientId: APIKEY
      });
  self.p_verifyLoginState();
}
ConnectDBox.prototype.p_setToken = p_setToken;

// object ConnectDBox.p_completeOAuth
// A callback to handle message from Dropbox's OAuth page
function p_completeOAuth(self, token)
{
  self.m_rawToken = token;
  self.p_parseToken();

  log.info('dropbox: login complete, closing tab#: ' + self.m_authenticationTab);

  utils_ns.assert(self.m_authenticationTab >= 0, 'p_completeOAuth: invalid tab id ' + self.m_authenticationTab);

  chrome.tabs.remove(self.m_authenticationTab);
  self.m_authenticationTab = -1;

  // Store token in localStorage
  // dropbox.token=self.m_rawToken
  localStorage.setItem(self.m_dboxTokenKey, self.m_rawToken);

  self.p_setToken();
}

// object ConnectDBox.dboxLoginLogout
// Handles click on Login/Logout button
function dboxLoginLogout()
{
  var self = this;

  if (self.m_authenticated)
  {
    log.info("dropbox: LoginLogout => logout");
    self.p_setLoggedOut();
    self.p_dboxSetLoginButton();
  }
  else
  {
    log.info("dropbox: LoginLogout => login start");

    const APIKEY = '1xjfqq4b6gvpsq8';
    self.m_client = new window.Dropbox.Dropbox({clientId: APIKEY});
    const fullReceiverPath =
      'moz-extension://d9585aca-b726-4305-b925-743007851f14/qfeeds/oauth_receiver_dbox.html';
    let authUrl =
      self.m_client.getAuthenticationUrl(fullReceiverPath, 'zzclient', 'token');

    chrome.tabs.create({ url: authUrl}, function (newTab)
        {
          self.m_authenticationTab = newTab.id;
          log.info('dropbox: New tab for authentication of Dropbox: ' + newTab.id);
        });
    // Control is passed to the newly create tab
    //
    // User interaction is passed over to Dropbox, it will come back
    // in p_completeOAuth() (via app.js message listener)
  };
}
ConnectDBox.prototype.dboxLoginLogout = dboxLoginLogout;

feeds_ns.ConnectDBox = ConnectDBox;
})();
