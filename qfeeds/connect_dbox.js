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

const APIKEY = '25sck7n54cqhfq8';

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
  self.m_dbxAuth = null;
  self.m_loginCode = null;  // Short-lived, obtain an Auth token with it
      
  if (window.navigator.vendor == "Google Inc.")
    self.m_fullReceiverPath = 'chrome-extension://kdjijdhlleambcpendblfhdmpmfdbcbd/qfeeds/oauth_receiver_dbox.html';
  else
    // Assume it is an extension of Firefox
    self.m_fullReceiverPath = 'moz-extension://f4a98444-8d82-4036-a9a3-98fee281183e/qfeeds/oauth_receiver_dbox.html';

  // Dropbox OAuth object
  // SDK sources: https://github.com/dropbox/dropbox-sdk-js/blob/main/src/auth.js
  self.m_dbxAuth = new window.Dropbox.Dropbox({clientId: APIKEY}).auth;

  self.m_authUrl = null;
  // Authentication URL (the new page/tab for user to go to for login into Dropbox)
  if (window.navigator.vendor == "Google Inc.")
  {
    log.info('OAuth on Google Chrome browser');
    authUrl = self.m_client.getAuthenticationUrl(self.m_fullReceiverPath, 'zzclient', 'token');
  }
  else
  {
    log.info('OAuth on Firefox browser');
    self.m_dbxAuth.getAuthenticationUrl(
            self.m_fullReceiverPath, // [redirectUri]
            undefined,    // [state] To help prevent cross site scripting attacks.
            'code',       // [authType] Auth type, defaults to 'token' or 'code'
            'online',     // [tokenAccessType] null, 'legacy', 'online', 'offline'
            undefined,    // [scope] Scopes to request for the grant
            undefined,    // [includeGrantedScopes] 'user', 'team'
            true          // [usePKCE]
            )
        .then(authUrl => {
          self.m_authUrl = authUrl
    })
  }

  self.m_authToken = null;
  self.m_accountID = null;

  // Local storage key to store the login code
  self.m_dboxLoginCodeKey = 'dropbox.code';
  self.m_dboxLoginToken = 'dropbox.token';

  // If we have the token already in localStorage use it
  if (startWithLoggedIn)
  {
    // Activate the token only after the object ConnectDBox is created
    setTimeout(function ()
    {
      self.m_loginCode = localStorage.getItem(self.m_dboxLoginCodeKey);
      if (self.m_loginCode != null)
        self.p_verifyToken();
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
  self.m_cb.addToHookAuthCompleted(function(oauthURL)
    {
      // Will be called with the OAuth URL from oauth_receiver_dbox.html
      p_completeOAuth(self, oauthURL);
    });

  Object.preventExtensions(this);
}

// object ConnectDBox.p_dboxGetAccountInfo()
function p_dboxGetAccountInfo(cb)
{
  let self = this;

  log.info('dropbox: p_dboxGetAccountInfo()');
  self.m_client.usersGetCurrentAccount()
      .then(function(response)
      {
        log.info('dropbox: p_dboxGetAccountInfo(), OK');
        self.m_user_name = response.result.name.given_name + ' ' + response.result.name.surname;
        self.m_user_email = response.result.email;
        cb(1);
      })
      .catch(function(error)
      {
        log.error('dropbox: p_dboxGetAccountInfo(), failure');
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

// object ConnectDBox.p_setLoggedOut
function p_setLoggedOut()
{
  let self = this;

  self.m_authenticated = false;
  self.m_loginCode = null;
  self.m_authToken = null;
  self.m_accountID = null;
  localStorage.removeItem(self.m_dboxLoginCodeKey);
}
ConnectDBox.prototype.p_setLoggedOut = p_setLoggedOut;

// object ConnectDBox.p_displayLoginState
// Verify if Dropbox connection is good by obtaining user info
function p_displayLoginState()
{
  let self = this;

  log.info('dropbox: p_displayLoginState()');
  self.p_dboxGetAccountInfo(function(status)
      {
        if (status == 1)
        {
          log.info('dropbox: login good.');
          self.m_authenticated = true;
          let connectionObj = {
            dbox_client: self.m_client
          };
          self.m_cb.onClientReady(0, connectionObj, function(progress)
              {
                self.m_cb.onProgress(progress);
              });
        }
        else
        {
          // Tell the main app the Dropbox connection is not active
          log.info('dropbox: login not active.');
          self.m_authenticated = false;
          self.p_setLoggedOut();
          self.m_cb.onClientReady(1, null, null);
        };

        self.p_dboxSetLoginButton();
      });
}
ConnectDBox.prototype.p_displayLoginState = p_displayLoginState;

// object ConnectDBox.p_parseQueryString
//
// Based on a function in Dropbox SDK examples
function p_parseQueryString(str)
{
  const ret = Object.create(null);

  if (typeof str !== 'string')
    return ret;

  // Parse data after '?'
  let q = str.indexOf('?');
  if (q < 0)
      return ret;
  // Everything after '?'
  str = str.substring(q + 1);
  if (!str)
    return ret;

  str.split('&').forEach((param) => {
    // Convert '+' to spaces and split on '='
    const parts = param.replace(/\+/g, ' ').split('=');
    // Firefox (pre 40) decodes `%3D` to `=`
    // https://github.com/sindresorhus/query-string/pull/37
    let key = parts.shift();
    let val = parts.length > 0 ? parts.join('=') : undefined;

    key = decodeURIComponent(key);

    // missing `=` should be `null`:
    // http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
    val = val === undefined ? null : decodeURIComponent(val);

    if (ret[key] === undefined)
      ret[key] = val;
    else if (Array.isArray(ret[key]))
      ret[key].push(val);
    else
      ret[key] = [ret[key], val];
  });

  return ret;
}
ConnectDBox.prototype.p_parseQueryString = p_parseQueryString

// object ConnectDBox.p_obtainToken
//
// We have login code and we need to obtain a token
function p_obtainToken()
{
  let self = this;

  // No token, attept to obtain token via getAccessTokenFromCode()
  self.m_dbxAuth.getAccessTokenFromCode(self.m_fullReceiverPath, self.m_loginCode)
      .then(function(response) {
          log.info('dropbox: p_obtainToken(), OK');
          console.log(response);
          self.m_authToken = response.result.access_token;
          self.m_dbxAuth.setAccessToken(response.result.access_token);
          self.m_client = new window.Dropbox.Dropbox({auth: self.m_dbxAuth});

          // Store token in localStorage
          // localstorage:dropbox.token=self.m_authToken
          localStorage.setItem(self.m_dboxLoginToken, self.m_authToken);

          // Obtain account info as a way to confirm connection is good
          self.p_displayLoginState();
        })
      .catch(function(error) {
          // Here:
          // m_logincCode is short-lived, if we get 400 then ask Dropbox to re-approve login

          if (error.status !== undefined && error.status == 400)
          {
            log.info('dropbox: p_verifyToken(), error 400, now p_TransitionToLoginPage():');
            self.p_TransitionToLoginPage(self.m_authUrl);
          }
          else
          {
            let msg = 'dropbox: p_verifyToken(), ';
            if (error.status === undefined)
            {
              msg += 'missing field "status"';
            }
            else
            {
              msg += 'error code: ' + String(error.status)
              if (error.message !== undefined)
                msg += ', message: ' + error.message;
            }

            log.info(msg);
            utils_ns.domError(msg);
          }
        });

}
ConnectDBox.prototype.p_obtainToken = p_obtainToken;

// object ConnectDBox.p_verifyToken
//
// This function is called when
//
// 1) We already have m_loginCode (after OAuth login)
// 2) The login code is used to obtain a token
// 3) The login code is short lived, if we get 400, we jump to the
//    OAuth login path (acting as if user has pressed the Login
//    button)
//
// Documentation:
// https://developers.dropbox.com/oauth-guide
//
function p_verifyToken()
{
  let self = this;

  log.info('dropbox: p_verifyToken()');
  let token = localStorage.getItem(self.m_dboxLoginToken);

  // If we have a token, use it
  if (token != null)
  {
    log.info('dropbox: p_verifyToken(), use existing token');

    self.m_authToken = token;
    self.m_dbxAuth.setAccessToken(token);
    self.m_client = new window.Dropbox.Dropbox({auth: self.m_dbxAuth});

    // Verify token freshness by an API call -- attempt to obtain account info
    self.m_client.usersGetCurrentAccount()
        .then(function(response)
        {
          log.info('dropbox: p_verifyToken(), API call OK');
          self.p_displayLoginState();
        })
        .catch(function(error)
        {
          // Here:
          // The token might have expired, if we get 401 then ask
          // Dropbox for a new token

          if (error.status !== undefined && error.status == 401)
          {
            log.info('dropbox: p_verifyToken(), error 401, token expired');
            self.p_obtainToken();
          }
          else
          {
            // A non 401 error

            let msg = 'dropbox: p_verifyToken(), ';
            if (error.status === undefined)
            {
              msg += 'missing field "status"';
            }
            else
            {
              msg += 'error code: ' + String(error.status)
              if (error.message !== undefined)
                msg += ', message: ' + error.message;
            }

            self.p_displayLoginState();

            log.info(msg);
            utils_ns.domError(msg);
          }
        });

  }
  else
  {
    self.p_obtainToken();
  }
  return;
}
ConnectDBox.prototype.p_verifyToken = p_verifyToken;

// object ConnectDBox.p_completeOAuth
// A callback to handle message from Dropbox's OAuth page
//
// To get here:
// oauth_receiver_dbox.js, chrome.runtime.sendMessage() => app.js,
// process message "oauthURL" => invoke hook target,
// p_CompleteOAuth()
function p_completeOAuth(self, oauthURL)
{
  utils_ns.assert(self.m_authenticationTab >= 0, 'p_completeOAuth: invalid tab id ' + self.m_authenticationTab);

  log.info('dropbox: p_completeOAuth(), closing tab#: ' + self.m_authenticationTab);
  chrome.tabs.remove(self.m_authenticationTab);
  self.m_authenticationTab = -1;

  let q = self.p_parseQueryString(oauthURL);
  if (q.code === undefined)
  {
    log.error('dropbox: missing code, login failed');
    return;
  }

  self.m_loginCode = q.code;

  // Store login code in localStorage
  // localstorage:dropbox.code=self.m_LoginCode
  localStorage.setItem(self.m_dboxLoginCodeKey, self.m_loginCode);

  // From a login code call Dropbox to obtain a token
  self.p_verifyToken();
}

function p_TransitionToLoginPage(authUrl)
{
  let self = this;

  chrome.tabs.create({ url: authUrl}, function (newTab)
      {
        self.m_authenticationTab = newTab.id;
        log.info('dropbox: New tab for authentication of Dropbox: ' + newTab.id);
      });
}
ConnectDBox.prototype.p_TransitionToLoginPage = p_TransitionToLoginPage;

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

    self.p_TransitionToLoginPage(self.m_authUrl);
  };
}
ConnectDBox.prototype.dboxLoginLogout = dboxLoginLogout;

feeds_ns.ConnectDBox = ConnectDBox;
})();
