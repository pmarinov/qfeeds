# Debug functions

From the browser's console can be invoked a list of debug functions


## Force fresh reload of remote feeds

Objectives:

* Delete local IndexedDB of subscribed feeds

* Reset cached version ID of the remote table

Invocation:
```
>> feeds_ns.app.m_feedsDir.m_feedsDB.feedUnsubscribeAll()
[Debug] Delete all subscriptions from IndexedDB...'
[Debug] Done, deleted 8 RSS subsciptions

>> feeds_ns.app.m_feedsDir.m_feedsDB.feedResetRTableConnection()
```

Close and re-open the extension. It should load all remote entries
into local IndexedDB


## Add example entries

Invocation:
```
>> feeds_ns.app.m_feedsDir.m_feedsDB.feedAddByUrl1()
[Debug] Added https://...

>> feeds_ns.app.m_feedsDir.m_feedsDB.feedAddByUrl2()
[Debug] Added https://...
```

## Unsubscribe All

Invocation:
```
>> feeds_ns.app.m_feedsDir.m_feedsDB.feedUnsubscribeAll(true)
[Debug] Delete all subscriptions from IndexedDB, remoteSync: true
[Debug] Done, deleted 2 RSS subsciptions
```
