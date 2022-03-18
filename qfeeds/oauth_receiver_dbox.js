// oauth_receiver_dbox.js, -*- mode: javascript; -*-

// This page will be loaded via a redirection by Dropbox and as part
// of the URL it will receive the OAuth code
//
// Example URL: moz-extension://f4a98444-8d82-4036-a9a3-98fee281183e/qfeeds/ \
// oauth_receiver_dbox.html?code=40hlwLAb0T8AAAAAAAEYHSWHmTvEZ-s8pbGnZOzFQR8
// (Wrapped for easier reading)

window.addEventListener('load', function()
    {
      // Send the entire URL to the program running in the main tab
      // via a message
      console.log('url: ' + window.location.href);
      chrome.runtime.sendMessage({msg: 'oauthURL', content: window.location.href});
    });
