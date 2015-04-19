#!/bin/bash

# Dropbox API
echo "Downloading dropbox.js..."
wget https://www.dropbox.com/developers/downloads/sdks/datastore/js/dropbox-js-datastore-sdk-1.1.0.zip
unzip dropbox-js-datastore-sdk-1.1.0.zip

# jQuery
echo "Downloading jquery.js..."
curl -O http://code.jquery.com/jquery-2.0.2.js

# Bootstrap
echo "Downloading bootstrap.js..."
wget https://github.com/twbs/bootstrap/releases/download/v3.2.0/bootstrap-3.2.0-dist.zip
unzip bootstrap-3.2.0-dist.zip

# sha1.js from Google
echo "Downloading md5.js (CryptoJS%20v3.1.2.zip)..."
curl -O "http://crypto-js.googlecode.com/files/CryptoJS%20v3.1.2.zip"
unzip CryptoJS%20v3.1.2.zip components/sha1-min.js components/sha1.js \
  components/core-min.js components/core.js

# Loglevel, a logging library
echo "Downloading loglevel.js..."
wget https://raw.github.com/pimterry/loglevel/0.5.0/dist/loglevel.js

# Google's HTML sanitizer in Javascript
echo "Downloading sanitizer.js..."
wget https://raw.githubusercontent.com/theSmaw/Caja-HTML-Sanitizer/0b682371621e097581b1b5ddfa9d4042baa1683f/sanitizer.js
wget https://raw.githubusercontent.com/theSmaw/Caja-HTML-Sanitizer/0b682371621e097581b1b5ddfa9d4042baa1683f/lib/uri.js
wget https://raw.githubusercontent.com/theSmaw/Caja-HTML-Sanitizer/0b682371621e097581b1b5ddfa9d4042baa1683f/lib/html4.js

echo "Done"
