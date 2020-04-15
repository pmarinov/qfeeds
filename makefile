# makefile
#
# Based on ideas by Joel Dueck, see: https://github.com/otherjoel/try-pollen

SHELL = /bin/bash

# This was tested to work with version 4.1 of GNU Make
ifneq ($(findstring GNU, $(shell $(MAKE) -v)), GNU)
    $(error Not a GNU Make)
endif

# ANSI encoded colors for the help screen
BOLD = \x1b[1m
NC = \x1b[0m

# TODO: Split into an include file -- deps.mak

lib/bootstrap-3.2.0-dist/js/bootstrap.js:
	mkdir -p lib
	@echo "[ Downloading bootstrap.js ]"
	cd lib && curl --silent --remote-name --location \
	    "https://github.com/twbs/bootstrap/releases/download/v3.2.0/bootstrap-3.2.0-dist.zip"
	cd lib && unzip bootstrap-3.2.0-dist.zip
	cd lib && rm bootstrap-3.2.0-dist.zip

lib/jquery-2.0.2.js:
	mkdir -p lib
	@echo "[ Downloading jquery.js ]"
	cd lib && curl --silent --remote-name --location "https://code.jquery.com/jquery-2.0.2.js"

lib/components/sha1.js:
	mkdir -p lib
	@echo "[ Downloading sha1.js ]"
	cd lib && curl --silent --remote-name --location \
	    "https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/crypto-js/CryptoJS%20v3.1.2.zip"
	cd lib &&  unzip CryptoJS%20v3.1.2.zip components/sha1-min.js components/sha1.js \
        components/core-min.js components/core.js
	cd lib && rm CryptoJS%20v3.1.2.zip

lib/loglevel.js:
	mkdir -p lib
	@echo "[ Downloading loglevel.js ]"
	cd lib && curl --silent --remote-name --location \
	    "https://raw.github.com/pimterry/loglevel/0.5.0/dist/loglevel.js"

Caja-HTML-Sanitezer-URL = \
    https://raw.githubusercontent.com/theSmaw/Caja-HTML-Sanitizer/0b682371621e097581b1b5ddfa9d4042baa1683f
lib/sanitizer.js:
	mkdir -p lib
	@echo "[ Downloading sanitizer.js ]"
	cd lib && curl --silent --remote-name --location "$(Caja-HTML-Sanitezer-URL)/sanitizer.js"
	cd lib && curl --silent --remote-name --location "$(Caja-HTML-Sanitezer-URL)/lib/uri.js"
	cd lib && curl --silent --remote-name --location "$(Caja-HTML-Sanitezer-URL)/lib/lib/html4.js"
	cd lib && patch -u sanitizer.js < ../sanitizer.js.patch

lib/prism.js:
	mkdir -p lib
	@echo "[ Downloading prism.js ]"
	cd lib && curl --silent --remote-name --location \
        "https://github.com/pmarinov/rrss/releases/download/v0.6.3-pre1/prism_for_rrss.tar.gz"
	cd lib && tar -xzvf prism_for_rrss.tar.gz
	cd lib && rm prism_for_rrss.tar.gz

JS_LIBS = lib/bootstrap-3.2.0-dist/js/bootstrap.js \
     lib/jquery-2.0.2.js \
     lib/components/sha1.js \
	 lib/loglevel.js \
	 lib/sanitizer.js \
	 lib/prism.js

all: $(JS_LIBS)
