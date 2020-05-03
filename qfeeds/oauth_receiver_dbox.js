// oauth_receiver_dbox.js, -*- mode: javascript; -*-

window.addEventListener('load', () =>
    {
      var token = window.location.hash;
      console.log('Process token: ' + token);
      chrome.runtime.sendMessage({msg: 'oauthConnectToken', content: token});
      window.location.hash = '';
    });
