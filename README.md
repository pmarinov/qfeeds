# QFeeds


## About QFeeds

_QFeeds is a reader of RSS feeds_

Features:

* Operates in a standalone mode as a web browser extension (Google
  Chrome, Firefox)
* Local storage is used to keep feed subscriptions and metadata
  (IndexedDB)
* No server side for processing of data (it is able to read intranet
  feeds, for example)
* Displays feeds alone or grouped into folders
* Uses Dropbox, optionally, for synchronization between
  computers (list of subscriptions and what was marked as read)


## Try it

* Version: 0.14.0
* Status: Beta
* Chrome webstore: https://chrome.google.com/webstore/detail/rrss/kdjijdhlleambcpendblfhdmpmfdbcbd


## Hacking

The documentation for developers is in mdBook format:
https://hangar118.sdf.org/p/qfeeds/docs/index.html


## Important

Google announced that the Realtime API is DEPRACATED as of November 28, 2017. See:
https://developers.google.com/google-apps/realtime/deprecation

The implementation plan of QFeeds has changed its emphasis towards migration to Dropbox.


## Implementation plan

* Make it work on Firefox (DONE)
* MIGRATE to Dropbox as an alternative to the deprecated Google Drive Real Time API (DONE)
* Implement Mark All As Read
* Implement display of unread counters


## License

QFeeds is [free software](http://www.gnu.org/philosophy/free-sw.html)
-- this means that everyone may use it, redistribute it, and/or modify
it under the terms of the BSD (FreeBSD) License.

Copyright (c) 2016-2024, Peter Marinov and Contributors. All rights reserved.

See LICENSE.txt, see CONTRIBUTORS.txt


## Note

The original name of this browser extension was r-rss
