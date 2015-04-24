#!/bin/bash

# Dropbox API
if [ -d "dropbox-js-datastore-sdk-1.1.0" ]
then
  echo "dropbox-js-datastore-sdk-1.1.0 already downloaded. skipping."
else
  echo "Downloading dropbox.js..."
  wget https://www.dropbox.com/developers/downloads/sdks/datastore/js/dropbox-js-datastore-sdk-1.1.0.zip
  unzip dropbox-js-datastore-sdk-1.1.0.zip
  rm  dropbox-js-datastore-sdk-1.1.0.zip
fi

# jQuery
if [ -f "jquery-2.0.2.js" ]
then
  echo "jquery.js already downloaded. skipping."
else
  echo "Downloading jquery.js..."
  curl -O http://code.jquery.com/jquery-2.0.2.js
fi

# Bootstrap
if [ -d "bootstrap-3.2.0-dist" ]
then
  echo "boostrap-3.2.0 already downloaded. skipping."
else
  echo "Downloading bootstrap.js..."
  wget https://github.com/twbs/bootstrap/releases/download/v3.2.0/bootstrap-3.2.0-dist.zip
  unzip bootstrap-3.2.0-dist.zip
  rm bootstrap-3.2.0-dist.zip
fi

# sha1.js from Google
if [ -f "components/sha1.js" ]
then
  echo "sha1.js alredy downloaded. skipping."
else
  echo "Downloading md5.js (CryptoJS%20v3.1.2.zip)..."
  curl -O "http://crypto-js.googlecode.com/files/CryptoJS%20v3.1.2.zip"
  unzip CryptoJS%20v3.1.2.zip components/sha1-min.js components/sha1.js \
    components/core-min.js components/core.js
  rm CryptoJS%20v3.1.2.zip
fi

# Loglevel, a logging library
if grep -q  "v0.5.0" loglevel.js
then
  echo "loglevel.js already downloaded. skipping."
else
  echo "Downloading loglevel.js..."
  wget https://raw.github.com/pimterry/loglevel/0.5.0/dist/loglevel.js
fi

# Google's HTML sanitizer in Javascript
if [ -f "html4.js" ]
then
  echo "sanitizer.js already downloaded. skipping."
else
  echo "Downloading sanitizer.js..."
  wget https://raw.githubusercontent.com/theSmaw/Caja-HTML-Sanitizer/0b682371621e097581b1b5ddfa9d4042baa1683f/sanitizer.js
  wget https://raw.githubusercontent.com/theSmaw/Caja-HTML-Sanitizer/0b682371621e097581b1b5ddfa9d4042baa1683f/lib/uri.js
  wget https://raw.githubusercontent.com/theSmaw/Caja-HTML-Sanitizer/0b682371621e097581b1b5ddfa9d4042baa1683f/lib/html4.js
  # Adapt from node-js module to web page format
  patch -u sanitizer.js < sanitizer.js.patch
fi

echo "Done"
