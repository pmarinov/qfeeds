// connect_gdrive.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2015, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Object for management of connection (login/logout) to Google Drive
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
{
  feeds_ns = {};
}

(function ()
{
"use strict";

// object ConnectGDrive.ConnectGDrive [constructor]
// Connect to Google Drive
// - Connects to Google Drive if user is already authenticated
// - Handle Login/Logout button
// - Shows user info and progress
function ConnectGDrive(cb, startWithLoggedIn)
{
  var self = this;

  self.$d =
  {
    btnGDrive: utils_ns.domFind('#xgdrive'),
    userGDrive: utils_ns.domFind('#xgoogle_user')
  };

  // Callback handlers
  self.m_cb = cb;

  self.m_user_email = '';
  self.m_user_name = '';
  self.m_accessToken = null;

  self.p_gdriveSetLoginButton();

  self.m_authenticated = false;

  gapi.load("drive-realtime,drive-share", function()
      {
        // callback: API Done Loading

        self.$d.btnGDrive.on('click', function (e)
            {
              self.p_gdriveLoginLogout(true);
            });

        if (!startWithLoggedIn)
          return;

        try  // GDrive swallows all errors, install my own catchers for displahy of my own errors
        {
          // Try to obtain access token if user was already logged in the last time
          self.p_gdriveLoginLogout(false);
        }
        catch (e)  // Error in my code, display it, then re-throw
        {
          log.error('gapi.load: ' + e.message);
          var errorObj =
          {
            stack: e.stack
          };
          window.onerror(e.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, errorObj);
          throw e;
        }
      });
}

// object ConnectGDrive.p_gdriveLoginLogout()
// Handle pressing of Login/Logout button
function p_gdriveLoginLogout(isInteractive)
{
  var self = this;

  if (self.m_authenticated)
  {
    self.m_authenticated = false;
    self.m_user_name = '';
    self.m_user_email = '';
    self.p_gdriveSetLoginButton();

    self.m_cb.setPref("m_local.app.logged_in", false);

    var token =
    {
      token: self.m_accessToken
    };

    chrome.identity.removeCachedAuthToken(token, function ()
        {
            console.log('sign_out1: OK');
        });
  }
  else
  {
    self.m_cb.setPref("m_local.app.logged_in", true);
    chrome.identity.getAuthToken({ 'interactive': isInteractive }, function(accessToken)
        {
          try  // GDrive swallows all errors, install my own catchers for displahy of my own errors
          {
            if (chrome.runtime.lastError)
            {
              //callback(chrome.runtime.lastError);
              log.error(chrome.runtime.lastError);
              self.m_accessToken = null;
              self.m_cb.onClientReady(1, accessToken);
              return;
            }
            self.m_accessToken = accessToken;
            chrome.identity.getProfileUserInfo(function(profileInfo)
                {
                  self.m_user_email = profileInfo.email;
                  self.p_gdriveSetLoginButton();
                });
            log.info('Google API Access token: ' + accessToken);
            self.m_cb.onClientReady(0, accessToken);
            self.m_authenticated = true;
          }
          catch (e)  // Error in my code, display it, then re-throw
          {
            log.error('chrome.identity.getAuthToken: ' + e.message);
            var errorObj =
            {
              stack: e.stack
            };
            window.onerror(e.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, errorObj);
            throw e;
          }
        });
  }
}
ConnectGDrive.prototype.p_gdriveLoginLogout = p_gdriveLoginLogout;

// object ConnectGDrive.p_gdriveSetLoginButton()
// Set the state of the Login/Logout button to Login or Logout
function p_gdriveSetLoginButton()
{
  var self = this;

  if (self.m_authenticated)
  {
    self.$d.btnGDrive.text('Logout \u2192');
    if (self.m_user_email != '')
      self.$d.userGDrive.text('(' + self.m_user_email + ')');
    else
      self.$d.userGDrive.text('(Connecting...)');
  }
  else
  {
    self.$d.btnGDrive.text('Login (GDrive)');
    self.$d.userGDrive.empty();
  }
}
ConnectGDrive.prototype.p_gdriveSetLoginButton = p_gdriveSetLoginButton;

feeds_ns.ConnectGDrive = ConnectGDrive;
})();
