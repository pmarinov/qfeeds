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

lib/bootstrap-3.2.0-dist/js/bootstrap.js:
	mkdir -p lib
	@echo "[ Downloading bootstrap.js ]"
	cd lib && curl --silent -O -L "https://github.com/twbs/bootstrap/releases/download/v3.2.0/bootstrap-3.2.0-dist.zip"
	cd lib && unzip bootstrap-3.2.0-dist.zip
	cd lib && rm bootstrap-3.2.0-dist.zip

lib/jquery-2.0.2.js:
	mkdir -p lib
	@echo "[ Downloading jquery.js ]"
	cd lib && curl --silent -O -L "https://code.jquery.com/jquery-2.0.2.js"

lib/components/sha1.js:
	mkdir -p lib
	@echo "[ Downloading sha1.js ]"
	cd lib && curl --silent -O -L \
	    "https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/crypto-js/CryptoJS%20v3.1.2.zip"
	cd lib &&  unzip CryptoJS%20v3.1.2.zip components/sha1-min.js components/sha1.js \
        components/core-min.js components/core.js
	cd lib && rm CryptoJS%20v3.1.2.zip

all: lib/bootstrap-3.2.0-dist/js/bootstrap.js \
     lib/jquery-2.0.2.js \
     lib/components/sha1.js
