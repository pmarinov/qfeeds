// feeds_dir.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Handles left-side panel -- panel for display and navigation of
// folders and feeds
// From the right-side panel it handles folder management and feed
// management areas
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
  feeds_ns = {};

(function ()
{
"use strict";

// object FeedsDir.FeedsDir [constructor]
// Instantiate one per application
function FeedsDir($dirPanel, feedDisp, panelMng)
{
  var self = this;

  self.m_feedsDB = null;
  self.m_feedDisp = feedDisp;
  self.m_panelMng = panelMng;
  var dispCB = self.p_getDispCBHandlers();
  self.m_feedDisp.setCBHandlers(dispCB);

  self.m_isOnFocus = false;

  var $containerFeedErrors = utils_ns.domFind('#xfeed_error_details');
  self.$d =
  {
    panel: $dirPanel,
    areaLoadingMsg: utils_ns.domFind('#xloading_msg_area'),
    areaAddPromptFirstTime: utils_ns.domFind('#xclick_add_first_time_area'),
    areaAddPrompt: utils_ns.domFind('#xclick_add_area'),
    btnAddBooks: utils_ns.domFind('#xadd_books'),
    areaAddRss: utils_ns.domFind('#xadd_feed_area'),
    feedContainer: utils_ns.domFind('#xdisplay_feed_container'),
    iconFolder: utils_ns.domFind('#ximg_folder'),
    iconRss: utils_ns.domFind('#ximg_rss'),
    titleTop: utils_ns.domFind('#xtitle_top', 1),
    titleLink: utils_ns.domFind('#xtitle_link', 1),
    addRss: utils_ns.domFind('#xadd_rss'),
    fetchProgressHolder: utils_ns.domFind('#xrssfetch_progress_holder'),
    fetchProgress: utils_ns.domFind('#xrssfetch_progress'),
    formNewRss: utils_ns.domFind('#xform_new_rss'),
    formFieldUrl: utils_ns.domFind('#xfield_input_url'),
    formCancel: utils_ns.domFind('#xform_cancel'),
    formCancelFolderRename: utils_ns.domFind('#xform_cancel_folder_name'),
    containerRecentlyViwed: utils_ns.domFind('#xrecent_container'),
    containerRecentlyEmpty: utils_ns.domFind('#xrecent_empty'),
    listRecent: [],
    areaRenameFolder: utils_ns.domFind('#xrename_folder_area'),
    areaSelectFolder: utils_ns.domFind('#xselect_folder_area'),
    areaSubscribeBtns: utils_ns.domFind('#xsubscribe_btns_area'),
    areaFolderSetBtn: utils_ns.domFind('#xset_btn_area'),
    areaUnsubscribeBtns: utils_ns.domFind('#xunsubscribe_btn_area'),
    areaUndo: utils_ns.domFind('#xfeed_unsub_undo_area'),
    areaFeedErrors:  utils_ns.domFind('#xfeed_error_area'),
    iconSettings: utils_ns.domFind('#xsettings_icon'),
    iconLink: utils_ns.domFind('#xtitle_link'),
    menuSelectFolder: utils_ns.domFind('#xfolder_select_menu'),
    btnSetFolder: utils_ns.domFind('#xfeed_setfolder'),
    btnSubscribe: utils_ns.domFind('#xfeed_subscribe'),
    btnCancel: utils_ns.domFind('#xfeed_cancel'),
    btnUnsubscribe: utils_ns.domFind('#xfeed_unsubscribe'),
    btnUndo: utils_ns.domFind('#xfeed_unsub_undo'),
    titleFeedErrors: utils_ns.domFind('#xfeed_error_text'),
    areaFeedErrorDetails: utils_ns.domFind('#xfeed_error_details'),
    containerFeedErrors: $containerFeedErrors,
    errorsList: utils_ns.domFindInside($containerFeedErrors, '.xfeed_error_entry', -1),
    btnShowErrorDetails: utils_ns.domFind('#xfeed_show_error_details'),
    btnHideErrorDetails: utils_ns.domFind('#xfeed_hide_error_details'),
    popupNewFolder: utils_ns.domFind('#xnew_folder'),
    inputNewFolder: utils_ns.domFind('#xinput_new_folder'),
    btnNewFolderSubmit: utils_ns.domFind('#xbtn_new_folder_submit'),
    areaInfoFeed: utils_ns.domFind('#xfeed_info_area'),
    areaInfoFolder: utils_ns.domFind('#xfolder_info_area'),
    iconInfo: utils_ns.domFind('#xfeed_icon'),
    infoUrl: utils_ns.domFind('#xfeed_info_url'),
    list: utils_ns.domFindInside($dirPanel, '.xentry', -1)
  };
  self.$d.listRecent = utils_ns.domFindInside(self.$d.containerRecentlyViwed, '.xrecent_entry', -1);

  // DOM events
  self.p_setFeedsDomHandlers();

  self.m_loadingInProgress = true;  // Loading feeds from the IndexedDB (local disk)
  self.m_isFirstTime = false;  // Is this the first time the program starts on this machine
  self.m_isFirstPrefetched = false;  // Is the offered feed prefetched
  self.m_urlFirstTimeOffer = 'http://feeds.theguardian.com/theguardian/books/rss';

  var feedsCB = self.p_getFeedsCBHandlers();

  self.m_feedsDB = new feeds_ns.Feeds(feedsCB);
  self.m_folders = []; // array of DirEntryFolder
  self.m_feeds = {};  // map of DirEntryFeed
  self.m_recentlyViewed = []; // array of RssHeaders, feeds accessed via the "Add" button
  self.m_displayList = [];
  self.m_currentFeedName = null;
  self.m_currentFeed = null;
  self.m_currentFeedEntries = null;  // map of hashes of RSSEntries
  self.m_saveCurrentFeedName = null;
  self.m_saveCurrentFeed = null;
  self.m_newFeedUrl = null;  // New feed currently offered on display for subscription
  self.m_unsubscribedFeedUrl = null;  // One unsubscription at a time (permits undo)
  self.m_unsubscribedFeedFolder = null;  // Remember the folder in case of undo

  self.m_settingsArea = false;  // Settings area is hidden

  self.m_newFolder = null;

  Object.preventExtensions(this);

  return this;
}

// object FeedsDir.remoteStoreConnected
function remoteStoreConnected()
{
  var self = this;
  self.m_feedsDB.rtableConnect();
}
FeedsDir.prototype.remoteStoreConnected = remoteStoreConnected;

// object FeedsDir.remoteStoreDisconnected
function remoteStoreDisconnected()
{
  var self = this;
}
FeedsDir.prototype.remoteStoreDisconnected = remoteStoreDisconnected;

// object FeedsDir.getFeedsDbObj
function getFeedsDbObj()
{
  var self = this;

  return this.m_feedsDB;
}
FeedsDir.prototype.getFeedsDbObj = getFeedsDbObj;

// object FeedsDir.p_setFeedsDomHandlers
// Attach handlers to various DOM events related to FeedsDir screen area
function p_setFeedsDomHandlers()
{
  var self = this;

  // Attach UI events handler to the DOM of the left hand side pane
  self.$d.panel.on('click', function (e)
      {
        log.info('Dir panel click');
        self.p_handleDirClick(e)
      });

  self.$d.containerRecentlyViwed.on('click', function (e)
      {
        log.info('Recently viewed container click');
        self.p_handleRecentlyViewedClick(e);
      })

  // The button 'add feed "Books"', shown only the first time program starts
  self.$d.btnAddBooks.on('click', function (e)
      {
        if (self.m_loadingInProgress)
          return;

        self.$d.areaLoadingMsg.toggleClass('hide', false);

        self.m_loadingInProgress = true;
        self.m_feedsDB.feedAddByUrl(self.m_urlFirstTimeOffer, '',
            function()  // When feed is commited to the db, activate it
            {
              self.p_activateDirEntry(0);
            });
      });

  // The blue "Add" button at the top of "FEEDS" section
  self.$d.addRss.on('click', function (e)
      {
        log.info('Add new RSS feed');
        self.p_handleAddRssButton(e);
      });

  // Handle form for entering ULR of new RSS feed
  self.$d.formNewRss.on('submit', function(e)
      {
        self.p_handleFormNewRss(e);
        e.preventDefault();
      });

  self.$d.formCancel.on('click', function(e)
      {
        self.m_newFeedUrl = null;
        if (self.m_displayList.length == 0)
        {
          // Feeds list is empty, piggy back on onFocus()
          self.onFocus();
        }
        else
        {
          self.p_restoreCurrentFeed();
        }
      });

  self.$d.formCancelFolderRename.on('click', function(e)
      {
        self.p_hideUnhideSections({
            hideAddRss: true,
            hideFeedContainer: false,
            hideAreaRenameFolder: true,
            hideAreaSelectFolder: true,
            hideAreaSubscribeBtns: true,
            hideAreaFolderSetBtn: true,
            hideAreaUnsubscribeBtns: true,
            hideUnsubscribeBtn: true,
            hideUndoArea: true,
            hideAreaInfoFeed: true,
            hideAreaInfoFolder: true,
            hideIconInfo: false,
            hideIconSettings: false,
            hideIconLink: true  // No "link" for folder
          });
      });

  self.$d.iconSettings.on('click', function(e)
      {
        self.p_handleHideUnhideSettings(e);
      });

  self.$d.iconInfo.on('click', function(e)
      {
        self.p_handleHideUnhideInfo(e);
      });

  self.$d.menuSelectFolder.on('change', function(e)
      {
        self.p_handleFolderMenuSelection(e);
      });

  self.$d.btnSetFolder.on('click', function(e)
      {
        self.p_handleFolderSet(e);
      });

  self.$d.btnSubscribe.on('click', function (e)
      {
        self.p_handleSubscribe(e);
      });

  // Cancel screen "Add" (subscription of a new feed)
  self.$d.btnCancel.on('click', function(e)
      {
        self.m_newFeedUrl = null;

        if (self.m_displayList.length == 0)
        {
          // Feeds list is empty, piggy back on onFocus()
          self.onFocus();
        }
        else
        {
          self.p_restoreCurrentFeed();

          self.p_hideUnhideSections({
              hideAddRss: true,
              hideFeedContainer: false,
              hideAreaRenameFolder: true,
              hideAreaSelectFolder: true,
              hideAreaSubscribeBtns: true,
              hideAreaFolderSetBtn: true,
              hideAreaUnsubscribeBtns: true,
              hideUnsubscribeBtn: true,
              hideUndoArea: true,
              hideAreaInfoFeed: true,
              hideAreaInfoFolder: true,
              hideIconInfo: false,
              hideIconSettings: false,
              hideIconLink: false
            });
        }
      });

  self.$d.btnUnsubscribe.on('click', function (e)
      {
        self.p_handleUnsubscribe(e);
      });

  self.$d.btnUndo.on('click', function (e)
      {
        self.p_handleUndo(e);
      });

  self.$d.btnShowErrorDetails.on('click', function (e)
      {
        self.p_hideAreaErrorDetails(false);
      });

  self.$d.btnHideErrorDetails.on('click', function (e)
      {
        self.p_hideAreaErrorDetails(true); // Keep details area hidden in the beginning
      });
}
FeedsDir.prototype.p_setFeedsDomHandlers = p_setFeedsDomHandlers;

// object FeedsDir.p_getFeedsCBHandlers
// Return list of Feeds CallBacks handlers
function p_getFeedsCBHandlers()
{
  var self = this;

  var feedsCB =
  {
    onDbCreated: function()  // Called only once when the db is created
        {
          self.m_isFirstTime = true;
        },

    onDbInitDone: function ()
        {
          log.info("CB: onDbInitDone...");
          self.m_loadingInProgress = false;  // The feeds list loaded from disk
          self.p_findUpdatedFolders();  // User added new folders?
          self.p_displayFeedsList();  // Show feeds or "Add prompt"
          if (self.m_displayList.length > 0)
          {
            log.info("Activate entry 0");
            self.p_activateDirEntry(0);
          };
          self.$d.areaLoadingMsg.toggleClass('hide', true);
          self.m_panelMng.enableMenuEntry('ximport_opml', true);
        },

    onRssUpdated: function(updates)
        {
          log.trace("CB: onRssUpdated...");

          self.p_findUpdatedFolders();  // User added new folders?
          self.p_updateFeeds(updates);  // Updated/added feeds?
          self.p_displayFeedsList();
        },

    onRssRemoved: function(listRemoved)
        {
          log.info("CB: onRssRemoved...");

          self.p_findUpdatedFolders();  // User added new folders?
          self.p_removeFeeds(listRemoved);  // removed feeds?
          self.p_displayFeedsList();
        },

    onRssFetchProgress: function(percent)
        {
          if (percent == -1)  // Goes into disabled state
            self.$d.fetchProgressHolder.toggleClass('hide', true);

          if (percent == 0)  // start
            self.$d.fetchProgressHolder.toggleClass('hide', false);

          self.$d.fetchProgress.attr('style', 'width: ' + percent + '%;');

          if (percent == 100)  // end
          {
            // Postglow for 1 second :-)
            setTimeout(function ()
                {
                  self.$d.fetchProgressHolder.toggleClass('hide', true);
                }, 1 * 1000);
          }
        },

    // Handle events generated from remote action. On another computer
    // user has marked something read or unread. If this is part of
    // the feed that is currently on display then reflect visually the
    // change.
    onRemoteMarkAsRead: function(hashRssEntry, hashRssFeed, isRead)
        {
          log.info("CB: onRemoteMarkAsRead...");

          self.p_handleRemoteMarkAsRead(hashRssEntry, hashRssFeed, isRead);
        },

    // Handle events generated from remote action. On another computer
    // user has deleted a feed. Reflect visually the change.
    onRemoteFeedDeleted: function(urlDeletedFeed)
        {
        },

    // Handle events generated from remote action. On another computer
    // user has added changed tags of a feed or added a new
    // feed. Reflect visually the change.
    onRemoteFeedUpdated: function(urlNewFeed, tags)
        {
          // The feed is already properly displayed
          // TODO: but if there is no other feed, activate this as current
          log.warn('TODO: activate feed ' + urlNewFeed);
        }
  };

  return feedsCB;
}
FeedsDir.prototype.p_getFeedsCBHandlers = p_getFeedsCBHandlers;

// object FeedsDir.p_getDispCBHandlers
// Returns handlers for callbacks for feedsDisp object
function p_getDispCBHandlers()
{
  var self = this;

  var dispCB =
  {
    // Called by FeedsDisp when user click on an entry and it needs
    // to be marked as read/unread
    markAsRead: function(entryHash, isRead, feedUrl)
        {
          log.info('CB: markAsRead...');
          // Check if this feed is subscribed or only a preview
          if (self.m_feeds[feedUrl] === undefined)
            log.info('feed is not yet subscribed: ' + feedUrl);
          else
          {
            self.m_feedsDB.markEntryAsRead(entryHash, isRead);
          }
        }
  }

  return dispCB;
}
FeedsDir.prototype.p_getDispCBHandlers = p_getDispCBHandlers;

// object FeedsDir.p_handleRemoteMarkAsRead
// Called in response of an event from a remote table. An entry was
// marked on another machine as read, reflect the changes on the screen
// (this callback is from the local database which hash already recorded
// the necessary changes)
function p_handleRemoteMarkAsRead(entryHash, feedHash, isRead)
{
  var self = this;

  // Only if this entry is among the currently displayed
  if (self.p_isEntryOnDisplay(entryHash) == null)
    return;

  self.m_feedDisp.markAsRead(entryHash, isRead);
}
FeedsDir.prototype.p_handleRemoteMarkAsRead = p_handleRemoteMarkAsRead;

// object FeedsDir.p_saveCurrentFeed
// Save current feed into m_saveXXX
// Set current to null, display left hand side pane
//
// This is needed by all actions that take over the right hand side pane
// where the feed/folder contents is displayed. After that operation
// is complete, the previous state can be restored by p_restoreCurrentFeed()
function p_saveCurrentFeed()
{
  var self = this;

  if (self.m_currentFeed == null)
    return;  // no current feed to save

  self.m_saveCurrentFeedName = self.m_currentFeedName;
  self.m_saveCurrentFeed = self.m_currentFeed;

  self.m_currentFeedName = null;
  self.m_currentFeed = null;

  // Display feeds directory (left pane) without highlighting any
  // as current
  self.p_displayFeedsList();
}
FeedsDir.prototype.p_saveCurrentFeed = p_saveCurrentFeed;

// object FeedsDir.p_restoreCurrentFeed
// Restore the feed that was temporarely hidden
function p_restoreCurrentFeed()
{
  var self = this;

  utils_ns.assert(self.m_displayList.length == 0, "p_restoreCurrentFeed: feeds list is empty");

  self.m_currentFeedName = self.m_saveCurrentFeedName;
  self.m_currentFeed = self.m_saveCurrentFeed;

  if (self.m_currentFeed == null)
    return;

  self.p_putCurrentFeed();
}
FeedsDir.prototype.p_restoreCurrentFeed = p_restoreCurrentFeed;

// object FeedsDir.p_hideUnhideSections
function p_hideUnhideSections(sections)
{
  var self = this;

  utils_ns.hasFields(sections,
    ['hideAddRss', 'hideFeedContainer', 'hideAreaRenameFolder', 'hideAreaSelectFolder',
     'hideAreaSubscribeBtns', 'hideAreaFolderSetBtn', 'hideAreaFolderSetBtn',
     'hideAreaFolderSetBtn', 'hideAreaUnsubscribeBtns',
     'hideUnsubscribeBtn', 'hideUndoArea', 'hideAreaInfoFeed',
     'hideAreaInfoFolder', 'hideIconInfo', 'hideIconSettings',
     'hideIconLink'],
    "in p_hideUnhideSections");

  self.$d.areaAddRss.toggleClass('hide', sections.hideAddRss);
  self.$d.feedContainer.toggleClass('hide', sections.hideFeedContainer);
  self.$d.areaRenameFolder.toggleClass('hide', sections.hideAreaRenameFolder);
  self.$d.areaSelectFolder.toggleClass('hide', sections.hideAreaSelectFolder);
  self.$d.areaSubscribeBtns.toggleClass('hide', sections.hideAreaSubscribeBtns);
  self.$d.areaFolderSetBtn.toggleClass('hide', sections.hideAreaFolderSetBtn);
  self.$d.areaUnsubscribeBtns.toggleClass('hide', sections.hideAreaUnsubscribeBtns);
  self.$d.btnUnsubscribe.toggleClass('hide', sections.hideUnsubscribeBtn);
  self.$d.areaUndo.toggleClass('hide', sections.hideUndoArea);
  self.$d.areaInfoFeed.toggleClass('hide', sections.hideAreaInfoFeed);
  self.$d.areaInfoFolder.toggleClass('hide', sections.hideAreaInfoFolder);
  self.$d.iconInfo.toggleClass('hide', sections.hideIconInfo);
  self.$d.iconSettings.toggleClass('hide', sections.hideIconSettings);
  self.$d.iconLink.toggleClass('hide', sections.hideIconLink);
}
FeedsDir.prototype.p_hideUnhideSections = p_hideUnhideSections;

// object FeedsDir.p_generateFoldersDropDown
// Populate the list of folders in the folder selection drop-down
function p_generateFoldersDropDown()
{
  var self = this;

  // Use m_folders
  var i = 0;
  var optionsHTML =
      '<option value="xnone">None</option>' +
      '<option value="xnew">Create new...</option>';
  for(i = 0; i < self.m_folders.length; ++i)
  {
    optionsHTML += '<option value="' +
                   toString(i) +
                   '">' +
                   self.m_folders[i].m_name +
                   '</option>';
  }
  // Optionally add name of one new folder, make it be selected
  if (self.m_newFolder != null)
  {
    optionsHTML += '<option value="xnew_folder" ' +
                   'selected="selected">' +
                   self.m_newFolder +
                   '</option>';
  }
  self.$d.menuSelectFolder.html(optionsHTML);
}
FeedsDir.prototype.p_generateFoldersDropDown = p_generateFoldersDropDown;

// object FeedsDir.p_displayFeedTitle
// Display feed or folder title at the top of the right-side panel
// NULL will clear the area
function p_displayFeedTitle(titleInfo)
{
  var self = this;

  if (titleInfo == null)
  {
    self.$d.titleTop.text('');
    self.$d.titleTop.attr('title', '');

    // Link & tooltip
    self.$d.titleLink.attr('href', '');
    self.$d.titleLink.attr('title', '');

    self.$d.iconFolder.toggleClass('hide', true);
    self.$d.iconRss.toggleClass('hide', false);
  }
  else
  {
    self.$d.titleTop.text(titleInfo.title);
    self.$d.titleTop.attr('title', titleInfo.tooltip);

    // Link & tooltip
    self.$d.titleLink.attr('href', titleInfo.link);
    self.$d.titleLink.attr('title', titleInfo.link);

    if (titleInfo.isFolder)
    {
      self.$d.iconFolder.toggleClass('hide', false);
      self.$d.iconRss.toggleClass('hide', true);
    }
    else
    {
      self.$d.iconFolder.toggleClass('hide', true);
      self.$d.iconRss.toggleClass('hide', false);
    }
  }
}
FeedsDir.prototype.p_displayFeedTitle = p_displayFeedTitle;

// object FeedsDir.p_hideAreaErrors
// Hide/Show details of feed errors. Show only if there are any errors.
function p_hideAreaErrors(feedHeader, doHide)
{
  var self = this;

  if (feedHeader.x_errors === undefined)
    feedHeader.x_errors = [];

  if (feedHeader.x_errors.length == 0)
    doHide = true;

  self.$d.areaFeedErrors.toggleClass('hide', doHide);  // Show the error msg area
  self.p_hideAreaErrorDetails(true);  // Show only after click on button "Details"
}
FeedsDir.prototype.p_hideAreaErrors = p_hideAreaErrors;

// object FeedsDir.p_hideAreaErrorDetails
// Hide/Show details of feed errors
function p_hideAreaErrorDetails(doHide)
{
  var self = this;

  self.$d.areaFeedErrorDetails.toggleClass('hide', doHide);
  self.$d.btnShowErrorDetails.toggleClass('hide', !doHide);
  self.$d.btnHideErrorDetails.toggleClass('hide', doHide);
}
FeedsDir.prototype.p_hideAreaErrorDetails = p_hideAreaErrorDetails;

// object FeedsDir.p_displayFeedErrors
// Put any feed errors in the corresponding display area
function p_displayFeedErrors(feedHeader, displayNow)
{
  var self = this;
  var i = 0;

  if (feedHeader.x_errors === undefined)
    feedHeader.x_errors = [];

  if (feedHeader.x_errors.length == 0)
  {
    self.$d.areaFeedErrors.toggleClass('hide', true);
    return;  // No errors to display
  }

  // Can the domList accomodate all error msg entries?
  if (feedHeader.x_errors.length > self.$d.errorsList.length)
  {
    var maxNew = feedHeader.x_errors.length - self.$d.errorsList.length;
    for (i = 0; i < maxNew; ++i)
      self.$d.containerFeedErrors.append($(self.$d.errorsList[0]).clone());
  }
  // Reacquire the expanded list
  self.$d.errorsList = utils_ns.domFindInside(self.$d.containerFeedErrors, '.xfeed_error_entry', -1);

  var x = 0;
  var $e = null;
  var $errorEntry = null;
  var $errorTitle = null;
  var $errorInfo = null;
  var shortInfo = '';
  for (i = 0; i < feedHeader.x_errors.length; ++i)
  {
    x = feedHeader.x_errors[i];
    utils_ns.assert(x instanceof feeds_ns.RssError, 'p_displayFeedErrors: x instanceof RssError');
    $e = jQuery(self.$d.errorsList[i]);

    shortInfo = x.m_info;
    if (shortInfo == null || shortInfo == '')
      shortInfo = '[no extra info]'
    if (shortInfo.length > 512)
      shortInfo = shortInfo.substring(0, 512) + '...';

    $errorTitle = utils_ns.domFindInside($e, '.xfeed_error_title');
    $errorInfo = utils_ns.domFindInside($e, '.xfeed_error_info');

    $errorTitle.text(x.m_title);
    $errorInfo.text(shortInfo);

    $e.toggleClass('hide', false);  // Make sure entry is not hidden
  }

  // Collapse all unused entries in self.$d.list
  for (; i < self.$d.errorsList.length; ++i)
  {
    $e = jQuery(self.$d.errorsList[i]);
    $e.toggleClass('hide', true);
  }

  self.p_hideAreaErrorDetails(true); // Keep details area hidden in the beginning
  self.p_hideAreaErrors(feedHeader, !displayNow);
}
FeedsDir.prototype.p_displayFeedErrors = p_displayFeedErrors;

// object FeedsDir.p_handleHideUnhideSettings
// Handle click on the gear icon (for settings) that is next to the
// feet or folder title in the right-side panel
function p_handleHideUnhideSettings(ev)
{
  var self = this;

  // Assume no new folder created by user
  self.m_newFolder = null;

  // Populate the list of folders in the folder selection drop-down
  self.p_generateFoldersDropDown();

  // TODO: check if current element is a folder (then show "Rename" section)
  if (self.m_currentFeed.m_isFolder)
  {
    self.$d.areaRenameFolder.toggleClass('hide');
  }
  else
  {
    if (self.m_settingsArea)  // Area is on, then hide it
    {
      self.$d.areaSelectFolder.toggleClass('hide', true);
      self.$d.areaFolderSetBtn.toggleClass('hide', true);
      self.$d.areaUnsubscribeBtns.toggleClass('hide', true);
      self.$d.btnUnsubscribe.toggleClass('hide', true);  // Show "Unsubscribe" btn
      self.m_settingsArea = false;  // State is "hidden"
    }
    else
    {
      self.$d.areaSelectFolder.toggleClass('hide', false);
      self.$d.areaFolderSetBtn.toggleClass('hide', false);
      self.$d.areaUnsubscribeBtns.toggleClass('hide', false);
      self.$d.btnUnsubscribe.toggleClass('hide', false);  // Show "Unsubscribe" btn
      self.m_settingsArea = true;  // State is "on"
    }
  }

  // Unconditionally hide some areas
  self.$d.areaUndo.toggleClass('hide', true);  // Hide "Undo" area
  self.$d.areaInfoFeed.toggleClass('hide', true);
  self.$d.areaInfoFolder.toggleClass('hide', true);
}
FeedsDir.prototype.p_handleHideUnhideSettings = p_handleHideUnhideSettings;

// object FeedsDir.p_handleHideUnhideInfo
function p_handleHideUnhideInfo(ev)
{
  var self = this;

  self.m_settingsArea = false;  // State is "hidden"

  var toShow = false;
  if (self.$d.areaInfoFeed.hasClass('hide'))
    toShow = true;  // Now it is hidden, so transition to stage "shown"

  // TODO: check if current element is a folder (then show "Folder info" section)
  self.$d.areaInfoFeed.toggleClass('hide');
  self.$d.areaRenameFolder.toggleClass('hide', true);
  self.$d.areaSelectFolder.toggleClass('hide', true);
  self.$d.areaUnsubscribeBtns.toggleClass('hide', true);
  self.$d.areaUndo.toggleClass('hide', true);
  self.$d.areaInfoFolder.toggleClass('hide', true);

  // Display error info if this is an individual feed
  if (!self.m_currentFeed.m_isFolder)
    self.p_displayFeedErrors(self.m_currentFeed.m_header, toShow);  // Show error area if any errors
}
FeedsDir.prototype.p_handleHideUnhideInfo = p_handleHideUnhideInfo;

// object FeedsDir.p_handleAddRssButton
// The blue "Add" button at the top of "FEEDS" section
function p_handleAddRssButton(ev)
{
  var self = this;

  self.p_onFocusLostFeed();
  self.p_saveCurrentFeed();

  var newUrl = self.$d.formFieldUrl.val("");

  self.p_hideUnhideSections({
      hideAddRss: false,
      hideFeedContainer: true,
      hideAreaRenameFolder: true,
      hideAreaSelectFolder: true,
      hideAreaSubscribeBtns: true,
      hideAreaFolderSetBtn: true,
      hideAreaUnsubscribeBtns: true,
      hideUnsubscribeBtn: true,
      hideUndoArea: true,
      hideAreaInfoFeed: true,
      hideAreaInfoFolder: true,
      hideIconInfo: true,
      hideIconSettings: true,
      hideIconLink: false
    });

  self.p_recentlyViewedDisplay();
}
FeedsDir.prototype.p_handleAddRssButton = p_handleAddRssButton;

// object FeedsDir.p_handleFolderMenuSelection
// Handle any change in the folder drop-down menu
function p_handleFolderMenuSelection(ev)
{
  var self = this;

  var menuSelection = self.$d.menuSelectFolder.val();
  var newFolder = null;
  if (menuSelection == 'xnew')
  {
    self.$d.menuSelectFolder.val('xnone');  // before the new is inserted and selected
    // Pop-up "New folder" dlg
    self.$d.popupNewFolder.modal('show');
    self.$d.inputNewFolder.focus();
    self.$d.btnNewFolderSubmit.on('click', function (ev)
      {
        self.$d.popupNewFolder.modal('hide');
        self.m_newFolder = self.$d.inputNewFolder.val();
        self.p_generateFoldersDropDown();
      });
  }
}
FeedsDir.prototype.p_handleFolderMenuSelection = p_handleFolderMenuSelection;

// object FeedsDir.p_handleFolderSet
// Handle click on "Set" button
// Change folder to what user selected from the drop-down menu
function p_handleFolderSet()
{
  var self = this;

  var menuSelection = self.$d.menuSelectFolder.val();

  if (menuSelection == 'xnew')
  {
    console.error('no valid folder name is selected');
    return;
  }

  var selectedFolder = null;
  if (menuSelection == 'xnone')
  {
    selectedFolder = '';
  }
  else
  {
    if (menuSelection == 'xnew_folder')
      selectedFolder = self.m_newFolder;
    else  // existing folder selected
      selectedFolder = self.$d.menuSelectFolder.find(":selected").text();
  }

  // Toggle Settings section (will get hidden)
  self.p_handleHideUnhideSettings(null);

  console.log('selected folder name: ' + selectedFolder);
  utils_ns.assert(self.m_currentFeed != null, "p_handleFolderSet: m_currentFeed != null");
  utils_ns.assert(self.m_currentFeed.m_isFolder == false, "p_handleFolderSet: m_isFolder == false");
  console.log('for feed: ' + self.m_currentFeed.m_header.m_url);
  self.m_feedsDB.feedSetTags(self.m_currentFeed.m_header.m_url, selectedFolder);
}
FeedsDir.prototype.p_handleFolderSet = p_handleFolderSet;

// object FeedsDir.p_recentlyViewedAdd
// Maintains the list of recently accessed RSS feeds via the "Add" button
// If the feed is already in the list: move it to the top
function p_recentlyViewedAdd(RssHeader)
{
  var self = this;

  // Check if already present, remove from the array
  var i = 0;
  var x = null;
  for (i = 0; i < self.m_recentlyViewed.length; ++i)
  {
    x = self.m_recentlyViewed[i];
    if (x.m_url == RssHeader.m_url)
    {
      self.m_recentlyViewed.splice(i, 1);
      break;
    }
  }

  // Insert at position 0
  self.m_recentlyViewed.splice(0, 0, RssHeader);
}
FeedsDir.prototype.p_recentlyViewedAdd = p_recentlyViewedAdd;

// object FeedsDir.p_recentlyViewedDisplay
function p_recentlyViewedDisplay()
{
  var self = this;

  var i = 0;
  var maxNew = self.m_recentlyViewed.length - self.$d.listRecent.length;
  if (maxNew > 0)  // Is there room for the list of recently viewed RSS feeds?
  {
    for (i = 0; i < maxNew; ++i)
      self.$d.containerRecentlyViwed.append($(self.$d.listRecent[0]).clone());
  }
  // Reacquire the expanded list
  self.$d.listRecent = utils_ns.domFindInside(self.$d.containerRecentlyViwed, '.xrecent_entry', -1);

  var x = null;
  var $e = null;
  var $title = null;
  var $url = null;
  var $subscribed = null;
  for (i = 0; i < self.m_recentlyViewed.length; ++i)
  {
    x = self.m_recentlyViewed[i];
    utils_ns.assert(x instanceof feeds_ns.RssHeader, "p_recentlyViewedDisplay: x instanceof feeds_ns.RssHeader");

    $e = $(self.$d.listRecent[i]);
    $e.toggleClass('hide', false);  // Make sure entry is not hidden

    $title = utils_ns.domFindInside($e, '.xrecent_title_source');
    $url = utils_ns.domFindInside($e, '.xrecent_url');
    $subscribed = utils_ns.domFindInside($e, '.xrecent_subscribed');

    // Check if the feed is already subscribed (is in the display dir)
    if (self.m_feeds[x.m_url] === undefined)
      $subscribed.toggleClass('hide', true);
    else
      $subscribed.toggleClass('hide', false);

    $title.text(x.m_title);
    $title.attr('title', '');
    $url.text(x.m_url);
  }

  // Collapse all unused entries in self.$d.list
  for (; i < self.$d.listRecent.length; ++i)
  {
    x = self.m_recentlyViewed[i];
    $e = $(self.$d.listRecent[i]);
    $e.toggleClass('hide', true);
  }

  // Show (none) if list is empty
  if (self.m_recentlyViewed.length == 0)
    self.$d.containerRecentlyEmpty.toggleClass('hide', false);
  else
    self.$d.containerRecentlyEmpty.toggleClass('hide', true);
}
FeedsDir.prototype.p_recentlyViewedDisplay = p_recentlyViewedDisplay;

// object FeedsDir.p_handleRecentlyViewedClick
// Handles a click on any entry from the list recently viewed
function p_handleRecentlyViewedClick(ev)
{
  var self = this;
  var i = 0;
  var idx = 0;
  var $item = null;
  var $ico = null;
  var x = null;
  for (i = 0; i < self.$d.listRecent.length; ++i)  // items: folders and feeds
  {
    $item = self.$d.listRecent[i];

    // Clicked on item _i_?
    if (!utils_ns.clickIsInside($item, ev.pageX, ev.pageY))
      continue;

    // Icon "View"
    $ico = utils_ns.domFindInside($item, '.xrecent_view');

    if (!utils_ns.clickIsInside($ico, ev.pageX, ev.pageY))
      continue;

    log.info('view ' + i);
    x = self.m_recentlyViewed[i];

    // Check if the feed is already subscribed (is in the display dir)
    if (self.m_feeds[x.m_url] === undefined)
      self.p_feedView(x.m_url);  // Not yet subscribed: display for viewing
    else
    {
      // Feed is subscribed, activate it
      idx = self.p_findDirEntry(x.m_url);
      utils_ns.assert(idx > 0, "p_handleRecentlyViewedClick: error: inconsistent feeds directory");

      log.info('activate ' + idx);
      self.p_activateDirEntry(idx);
    }

    break;
  }
}
FeedsDir.prototype.p_handleRecentlyViewedClick = p_handleRecentlyViewedClick;

// object FeedsDir.p_feedView
// Display a feed with buttons for Subscribe
// Feed is fetched directly from the web site, not from IndexedDB
// (it is a preview for subscription action by user)
function p_feedView(newUrl)
{
  var self = this;

  self.p_hideUnhideSections({
      hideAddRss: true,
      hideFeedContainer: true,
      hideAreaRenameFolder: true,
      hideAreaSelectFolder: true,
      hideAreaSubscribeBtns: true,
      hideAreaFolderSetBtn: true,
      hideAreaUnsubscribeBtns: true,
      hideUnsubscribeBtn: true,
      hideUndoArea: true,
      hideAreaInfoFeed: true,
      hideAreaInfoFolder: true,
      hideIconInfo: true,
      hideIconSettings: true,
      hideIconLink: false
    });

  self.m_newFeedUrl = newUrl;

  // Read the feed and display it
  feeds_ns.fetchRss(newUrl,
      function(c, feed, errorMsg)
      {
        var j = 0;
        var t = '';
        var keys = [];
        var entries = [];

        if (c != 0)
        {
          var shortMsg = errorMsg.substring(0, 80) + '...';
          console.warn('rss fetch, failed: ' + shortMsg + ', for: ' + newUrl);
        }
        else
          console.log('success: ' + newUrl);

        // Populate the list of folders in the folder selection drop-down
        self.p_generateFoldersDropDown();

        // Prepare for user to select folder and Subscribe/Cancel
        self.p_hideUnhideSections({
            hideAddRss: true,
            hideFeedContainer: false,
            hideAreaRenameFolder: true,
            hideAreaSelectFolder: false,
            hideAreaSubscribeBtns: false,
            hideAreaFolderSetBtn: true,
            hideAreaUnsubscribeBtns: true,
            hideUnsubscribeBtn: true,
            hideUndoArea: true,
            hideAreaInfoFeed: true,
            hideAreaInfoFolder: true,
            hideIconInfo: true,
            hideIconSettings: true,
            hideIconLink: false
          });

        // fetchRss() delivers a dictionary, feedDisplay() needs an array:
        // convert from dictionary to an array
        keys = Object.keys(feed.x_items);
        for (j = 0; j < keys.length; ++j)
        {
          t = feed.x_items[keys[j]];
          // For each item fill in the header back reference (x_header)
          t.x_header = feed;

          // Sanitize
          t.m_description = Sanitizer.sanitize(t.m_description, function (s)
              {
                // A naive URL rewriter
                log.info('sanitizer URL: ' + s);
                return s;
              });

          // Ready for display
          entries.push(t);
        }
        feed.x_items = null;  // no longer needed

        // Only for viewing, not subscribed yet
        feed.x_is_read_only = true;

        // Show in the list of Recently Viewed
        self.p_recentlyViewedAdd(feed);

        // Display feed name and header area
        self.p_displayFeedTitle({
            title: feed.m_title,
            url: feed.m_url,
            link: feed.m_link,
            tooltip: feed.m_link,
            isFolder: false
          });

        // Populate error information, if any
        self.p_displayFeedErrors(feed, true);

        // Populate info area in case of "Info" button (info icon)
        self.$d.infoUrl.text(feed.m_url);

        // Display the array of feed entries
        self.m_feedDisp.feedDisplay(entries, new self.m_feedDisp.DispContext);
      });
}
FeedsDir.prototype.p_feedView = p_feedView;

// object FeedsDir.p_handleFormNewRss
// Handle form for entering ULR of new RSS feed
function p_handleFormNewRss(ev)
{
  var self = this;

  var newUrl = self.$d.formFieldUrl.val();
  log.info('new RSS URL: ' + newUrl);

  // Check for empty
  if (newUrl.length == 0)
  {
    log.info('empty');
    return;
  }

  // Check for spaces
  var i = 0;
  var isSpacesOnly = true;
  for (i = 0; i < newUrl.length; ++i)
  {
    if (newUrl[i] > ' ')
    {
      isSpacesOnly = false;
      break;
    }
  }
  if (isSpacesOnly)
  {
    log.info('spaces only');
    return;
  }

  self.p_feedView(newUrl);
}
FeedsDir.prototype.p_handleFormNewRss = p_handleFormNewRss;

// object FeedsDir.p_handleSubscribe
// Handle button "Subscribe" when feed is displayed
function p_handleSubscribe(ev)
{
  var self = this;
  utils_ns.assert(self.m_newFeedUrl != null, "p_handleSubscribe: m_newFeedUrl is 'null'");

  var selectedFolder = null;
  var menuSelection = self.$d.menuSelectFolder.val();
  if (menuSelection == 'xnew' || menuSelection == 'xnone')
  {
    selectedFolder = null;
  }
  else
  {
    if (menuSelection == 'xnew_folder')
      selectedFolder = self.m_newFolder;
    else  // existing folder selected
      selectedFolder = self.$d.menuSelectFolder.find(":selected").text();
  }

  var urlRss = self.m_newFeedUrl;
  var tags = '';
  if (selectedFolder != null)
  {
    tags = selectedFolder;
    log.info('subscribe: in folder ' + selectedFolder + ' url:' + self.m_newFeedUrl);
  }
  else
    log.info('subscribe: url:' + self.p_newFeedUrl);
  self.m_feedsDB.feedAddByUrl(self.m_newFeedUrl, tags,
      function()
      {
        // Feed's _add_ operation is complete
        // (feed data is in the DB)
        log.info("RSS added to DB (completed): " + urlRss);

        // This function would activate an RSS feed as a result of Add operation
        if (self.m_newFeedUrl == null)  // User already switched away to something else?
          return;

        var idx = self.p_findDirEntry(urlRss);
        if (idx < 0)
          return;

        log.info('activate ' + idx);
        self.p_activateDirEntry(idx);
      });
}
FeedsDir.prototype.p_handleSubscribe = p_handleSubscribe;

// object FeedsDir.p_handleUnsubscribe
// Handle click on button "Unsubscribe".
// Put a feed in the temporary unsubscribed state, display that it was unsibscribed,
// show the "Undo" area
function p_handleUnsubscribe(ev)
{
  var self = this;

  self.m_unsubscribedFeedUrl = self.m_currentFeed.m_header.m_url;
  self.m_unsubscribedFeedFolder = self.m_currentFeed.m_header.m_tags;

  self.$d.areaRenameFolder.toggleClass('hide', true);  // No other settings are relevent
  self.$d.areaSelectFolder.toggleClass('hide', true);  // No other settings are relevent
  self.$d.iconInfo.toggleClass('hide', true);
  self.$d.iconSettings.toggleClass('hide', true);

  self.$d.areaUnsubscribeBtns.toggleClass('hide', true);  // Hide "Unsubscribe" area
  self.$d.areaUndo.toggleClass('hide', false);  // Show "Undo" area

  // Store the unsubscribed state
  self.m_feedsDB.feedMarkUnsubscribed(self.m_unsubscribedFeedUrl, true);

  // Show that the feed was removed: display dir without it
  self.p_displayFeedsList();
}
FeedsDir.prototype.p_handleUnsubscribe = p_handleUnsubscribe;

// object FeedsDir.p_handleUndo
// Undo of feed Unsibsribtion ->  revert the unsubscribed state of the feed
//
// Note: on the othe hand, unsubscription is completed whenever the focus of
// the current feed (the one in the unsubscribed state) is lost
function p_handleUndo(ev)
{
  var self = this;

  utils_ns.assert(self.m_unsubscribedFeedUrl != null, "p_handleUndo: m_unsubscribedFeedUrl is 'null'");

  // Restore sections as they were before "Unsibscribe"
  self.p_hideUnhideSections({
      hideAddRss: true,
      hideFeedContainer: false,
      hideAreaRenameFolder: true,
      hideAreaSelectFolder: true,
      hideAreaSubscribeBtns: true,
      hideAreaFolderSetBtn: true,
      hideAreaUnsubscribeBtns: true,
      hideUnsubscribeBtn: true,
      hideUndoArea: true,
      hideAreaInfoFeed: true,
      hideAreaInfoFolder: true,
      hideIconInfo: false,
      hideIconSettings: false,
      hideIconLink: false
    });

  self.m_settingsArea = false;  // State is "hidden"

  // Revert the unsubscribed state
  self.m_feedsDB.feedMarkUnsubscribed(self.m_unsubscribedFeedUrl, false);

  self.m_unsubscribedFeedUrl = null;  // Remove from temporary "unsubscribed" state
  self.m_unsubscribedFeedFolder = null;
  self.p_displayFeedsList();  // Display feed back in place
}
FeedsDir.prototype.p_handleUndo = p_handleUndo;

// object FeedsDir.p_completeUnsubscription
//
// Complete the operation of Unsubscription of a feed. At the moment
// the feed is marked as unsibscribed and the focus is lost, the
// chance of hitting "Undo" is lost, so remove the feed completely
function p_completeUnsubscription()
{
  var self = this;

  self.m_feedsDB.feedRemove(self.m_unsubscribedFeedUrl);
  log.info('completed unsubscription of ' + self.m_unsubscribedFeedUrl);
  self.m_unsubscribedFeedUrl = null;

  // Display the empty array of feed entries
  var entries = [];
  self.m_feedDisp.feedDisplay(entries, self.m_currentFeed.m_dispContext);

  // The unsubscribed was also the current: no longer
  self.m_currentFeed = null;
  self.m_currentFeedName = null;
  self.m_currentFeedEntries = null;
}
FeedsDir.prototype.p_completeUnsubscription = p_completeUnsubscription;

// object FeedsDir.p_getFeedsInFolder
// Find all feeds that belong to folder _folderName_
// Returns an array of feed urls
function p_getFeedsInFolder(folderName)
{
  var self = this;

  var j = 0;
  var feeds = [];
  var keys = [];
  var key = null;
  var feed = null;
  var header = null;

  // Walk all feeds and see which are in this folder
  keys = Object.keys(self.m_feeds);
  for (j = 0; j < keys.length; ++j)
  {
    key = keys[j];
    feed = self.m_feeds[key];
    header = feed.m_header;
    if (header.m_tags == folderName)
      feeds.push(header.m_url);
  }

  return feeds;
}
FeedsDir.prototype.p_getFeedsInFolder = p_getFeedsInFolder;

// object FeedsDir.p_feedIsCurrent
// Helper function for p_putCurrentFeed()
function p_feedIsCurrent(f)
{
  var self = this;

  if (f.m_isFolder)
  {
    if (self.m_currentFeedName != f.m_name)
      return false;
  }
  else
  {
    if (self.m_currentFeedName != f.m_header.m_url)
      return false;
  }

  return true;
}
FeedsDir.prototype.p_feedIsCurrent = p_feedIsCurrent;

// object FeedsDir.p_mapRssEntries
// Store the hashes of all entries
// This is used for quick check if an entry, referenced by its hash,
// is currently on display
function p_mapRssEntries(entries)
{
  var self = this;

  self.m_currentFeedEntries = null;  // empty the map
  self.m_currentFeedEntries = {};

  var k = 0;
  var h = 0;
  var rssEntry = null;
  var rssurl_hash = null;
  for (k = 0; k < entries.length; ++k)
  {
    rssEntry = entries[k];
    h = rssEntry.m_rssurl_date.indexOf('_');
    utils_ns.assert(h >= 0, "p_mapRssEntries: invalid rssurl_date hash");
    rssurl_hash = rssEntry.m_rssurl_date.slice(0, h);

    self.m_currentFeedEntries[rssEntry.m_hash] = rssurl_hash;
  }
}
FeedsDir.prototype.p_mapRssEntries = p_mapRssEntries;

// object FeedsDir.p_isEntryOnDisplay
// Checks if certain rss entry is currently on display
// Returns: null of entry is not on display
// Retrurns: rss_feed_hash is entry is currently on display
function p_isEntryOnDisplay(entry_hash)
{
  var self = this;

  if (self.m_currentFeedEntries == null)
    return null;

  var rssFeedHash = self.m_currentFeedEntries[entry_hash];

  if (rssFeedHash === undefined)
    return null;

  return rssFeedHash;
}
FeedsDir.prototype.p_isEntryOnDisplay = p_isEntryOnDisplay;

// object FeedsDir.p_displayFeedAndTitle
// Helper function for p_putCurrentFeed()
function p_displayFeedAndTitle(f, entries)
{
  var self = this;

  var hideIconLink = false;
  if (f.m_isFolder)  // Folders don't have destination link
    hideIconLink = true;

  // Hide unhide relevent display sections
  self.p_hideUnhideSections({
      hideAddRss: true,
      hideFeedContainer: false,
      hideAreaRenameFolder: true,
      hideAreaSelectFolder: true,
      hideAreaSubscribeBtns: true,
      hideAreaFolderSetBtn: true,
      hideAreaUnsubscribeBtns: true,
      hideUnsubscribeBtn: true,
      hideUndoArea: true,
      hideAreaInfoFeed: true,
      hideAreaInfoFolder: true,
      hideIconInfo: false,
      hideIconSettings: false,
      hideIconLink: hideIconLink
    });

  // Display feed name and header area
  if (f.m_isFolder)
  {
    self.p_displayFeedTitle({
        title: f.m_name,
        url: '',
        link: '',
        tooltip: '',
        isFolder: true
      });
    self.$d.infoUrl.text('folder');
  }
  else
  {
    self.p_displayFeedTitle({
        title: f.m_header.m_title,
        url: f.m_header.m_url,
        link: f.m_header.m_link,
        tooltip: f.m_header.m_description,
        isFolder: false
      });

    // Pull error info from m_feeds
    // f.m_header comes from the IndexedDB where error info is not stored
    var key = f.m_header.m_url;
    f.m_header.x_errors = self.m_feeds[key].m_header.x_errors;

    // Populate error information, if any
    self.p_displayFeedErrors(f.m_header);

    // Populate info area in case of "Info" button (info icon)
    self.$d.infoUrl.text(f.m_header.m_url);
  }

  // Display the RSS items, set dispContext for it
  self.m_feedDisp.feedDisplay(entries, f.m_dispContext);

  // Prepare the reverse map[rss_entry_hash] = rss_feed_hash
  self.p_mapRssEntries(entries);

  // Display number of unread on the left pane (feeds directory)
  self.p_displayFeedsList();
}
FeedsDir.prototype.p_displayFeedAndTitle = p_displayFeedAndTitle;

// for binarySearch() or sort()
function compareRssEntriesByDateDescending(entry1, entry2)
{
  var t1 = entry1.m_date.getTime();
  var t2 = entry2.m_date.getTime();
  if (t1 > t2)
    return -1;
  if (t1 < t2)
    return 1;
  return 0;
}

// object FeedsDir.p_addEntrySorted
// Add newEntry into entries which is sorted by date. Oldest are
// dropped if size exceeds max.
// Helper function for p_putCurrentFeed().
function p_addEntrySorted(entries, newEntry, max)
{
  var self = this;

  // Find insertion point into the sorted entries[]
  var m = entries.binarySearch(newEntry, compareRssEntriesByDateDescending);
  if (m < 0)  // No entry with this date yet
    m = -(m + 1);  // Adjust for insertion point

  if (m >= entries.length)  // add?
    entries.push(newEntry);
  else  // insert
    entries.splice(m, 0, newEntry);

  if (entries.length > max)
    entries.length = max;
}
FeedsDir.prototype.p_addEntrySorted = p_addEntrySorted;

// object FeedsDir.p_putCurrentFeed
// current feed is m_currentFeed, it is an individual feed or a folder
// Read contents of the feed from the database
// Mark it as current on left pane, dipslay feed on the right pane
function p_putCurrentFeed()
{
  var self = this;

  utils_ns.assert(self.m_currentFeed != null, "m_putCurrentFeed: m_currentFeed is 'null'");

  var j = 0;
  var req = null;
  var f = null;
  var entries = [];
  var total = 0;
  var numUnread = 0;
  var k = 0;
  var feeds = [];
  var feed = null;
  var feedUrl = null;
  var shouldCancel = false;
  var numDone = 0;

  f = self.m_currentFeed;
  var hideIconLink = false;
  if (f.m_isFolder)
  {
    feeds = self.p_getFeedsInFolder(f.m_name);
    hideIconLink = true;  // Folders don't have destination link
  }
  else
    feeds.push(self.m_currentFeedName);

  // Hide unhide relevent display sections
  self.p_hideUnhideSections({
      hideAddRss: true,
      hideFeedContainer: false,
      hideAreaRenameFolder: true,
      hideAreaSelectFolder: true,
      hideAreaSubscribeBtns: true,
      hideAreaFolderSetBtn: true,
      hideAreaUnsubscribeBtns: true,
      hideUnsubscribeBtn: true,
      hideUndoArea: true,
      hideAreaInfoFeed: true,
      hideAreaInfoFolder: true,
      hideIconInfo: false,
      hideIconSettings: false,
      hideIconLink: hideIconLink
    });
  // Clear title area
  self.p_displayFeedTitle(null);

  // Compute request start point
  req = self.m_feedDisp.computePageRequest(0, f.m_dispContext);

  f.m_numUnread = 0;

  // Read entries from the DB for all the feeds that were lined up
  // (one individual feed or all feeds in a folder)
  for (k = 0; k < feeds.length; ++k)
  {
    (function ()  // Each read request needs its own closure for the feed back-ref
    {
      var feedUrl = feeds[k];
      var feed = self.m_feeds[feedUrl];  // Prepare for the back-ref
      self.m_feedsDB.feedReadEntries(feeds[k],
          req.m_startDate, req.m_isDescending,
          function (entry)  // cbFilter
          {
            if (entry != null)  // No more entries?
            {
                // Put back-ref link (entry -> rss_header)
                // Needed for display which feed the entry belongs
                entry.x_header = feed.m_header;

                self.p_addEntrySorted(entries, entry, req.m_num);

              // Scan all items in order to count unread
              if (!entry.m_is_read)
                ++numUnread;
              return 1;
            }
            else  // We are done reading, we have all entries from the DB we need
            {
              ++numDone;
              total = 0;  // pull req.m_num entries for each of the feeds

              // Did user already click onto another feed?
              if (!self.p_feedIsCurrent(f))
                return 0;  // Cancel reading

              f.m_numUnread += numUnread;
              numUnread = 0;

              if (numDone < feeds.length)  // Finished reading all feeds?
                return 1;  // Continue reading

              // Finished reading all feeds that were lined up?
              self.p_displayFeedAndTitle(f, entries);

              log.info(entries.length + ' entries');
              log.info(f.m_numUnread + ' entries un-read');
              return 1;  // Done reading
            }
          });
    })();
  };
}
FeedsDir.prototype.p_putCurrentFeed = p_putCurrentFeed;

// object FeedsDir.p_onFocusLostFeed
// This method is called when user switches to a new current feed
function p_onFocusLostFeed()
{
  var self = this;

  self.m_newFeedUrl = null;  // Cancel any pending add opertion

  // Complete any pending "Unsubscribe" operation
  if (self.m_unsubscribedFeedUrl != null)
    self.p_completeUnsubscription();

  self.m_settingsArea = false;  // State is "hidden"

  // Hide prompt area
  self.$d.areaAddPromptFirstTime.toggleClass('hide', true);
  self.$d.areaAddPrompt.toggleClass('hide', true);
}
FeedsDir.prototype.p_onFocusLostFeed = p_onFocusLostFeed;

// object FeedsDir.onFocus
// This method is called when the app will display feeds screen
// on the right hand pane
function onFocus()
{
  var self = this;

  self.m_isOnFocus = true;

  if (self.m_loadingInProgress)
  {
    self.$d.areaLoadingMsg.toggleClass('hide', false);
  }
  else
  {
    if (self.m_currentFeedName == null && self.m_displayList.length > 0)
      self.p_activateDirEntry(0);  // Automatically select one if nothing is current
    else
    {
      var hideIconLink = false;
      if (self.m_currentFeed != null && self.m_currentFeed.m_isFolder)  // Folders don't have destination link
        hideIconLink = true;

      // Hide unhide relevent display sections
      // This will close any state like "Info", "Settings", etc.
      self.p_hideUnhideSections({
          hideAddRss: true,
          hideFeedContainer: false,
          hideAreaRenameFolder: true,
          hideAreaSelectFolder: true,
          hideAreaSubscribeBtns: true,
          hideAreaFolderSetBtn: true,
          hideAreaUnsubscribeBtns: true,
          hideUnsubscribeBtn: true,
          hideUndoArea: true,
          hideAreaInfoFeed: true,
          hideAreaInfoFolder: true,
          hideIconInfo: false,
          hideIconSettings: false,
          hideIconLink: hideIconLink
        });

      // Highlight the current to show this is on focus
      self.p_displayFeedsList();
    }
  }
}
FeedsDir.prototype.onFocus = onFocus;

// object FeedsDir.onFocusLost
// This method is called when the app will display another screen
// on the right hand pane
// (About for example)
function onFocusLost()
{
  var self = this;

  self.m_isOnFocus = false;

  // Don't show anything in bold
  self.p_displayFeedsList();

  // Any upkeep for feed focus lost
  self.p_onFocusLostFeed();
}
FeedsDir.prototype.onFocusLost = onFocusLost;

// object FeedsDir.p_findDirEntry
// Finds the index of a dir entry by URL
function p_findDirEntry(urlRss)
{
  var self = this;

  var k = 0;
  var f = null;
  for (k = 0; k < self.m_displayList.length; ++k)
  {
    f = self.m_displayList[k];
    if (f.m_isFolder)
      continue;
    if (f.m_header.m_url == urlRss)
      return k;
  }

  return -1;
}
FeedsDir.prototype.p_findDirEntry = p_findDirEntry;

// object FeedsDir.p_feedFindFolder
// Find the folder to which an rss dir entry belongs, -1 if not in a folder
function p_feedFindFolder(num)
{
  var self = this;
  utils_ns.assert(num < self.m_displayList.length, "p_feedFindFolder: 'num' out of bounds");

  var f = null;
  var x = null;
  var k = 0;
  f = self.m_displayList[num];
  utils_ns.assert(f instanceof DirEntryFeed, "p_feedFindFolder: x instanceof DirEntryFeed");

  // Does it belong to any folder?
  var hdr = f.m_header;
  if (hdr.m_tags == '' || hdr.m_tags == null)
     return -1;  // Not in a folder

  // Walk back into the vertical list, stop at first folder
  for (k = num; k >= 0; --k)
  {
    x = self.m_displayList[k];
    if (x.m_isFolder)
      return k;
  }
  return -1;  // No containing folder was reached
}
FeedsDir.prototype.p_feedFindFolder = p_feedFindFolder;

// object FeedsDir.p_activateDirEntry
// Set pCurrentFeed/Name to one of the entries in the feed directory
// If feed is inside a directory, activate the directory not the feed
// param: num -- which entry to make current
function p_activateDirEntry(num)
{
  var self = this;
  utils_ns.assert(num < self.m_displayList.length, "p_activateDirEntry: 'num' out of bounds");

  // All loaded
  self.$d.areaLoadingMsg.toggleClass('hide', true);
  self.m_loadingInProgress = false;

  var f = null;
  var fo = null;
  var foNum = 0;
  f = self.m_displayList[num];

  // Switching to another feed
  if (self.m_currentFeed != f)
    self.p_onFocusLostFeed();

  if (f.m_isFolder)
  {
    if (false)
    {
      // TODO: remove
      // Temp experiment of reading all entries of IndexedDB
      // Use this in the function that should trim data older than 3 months
      var cnt = 0;
      self.m_feedsDB.feedReadEntriesAll(function(rssEntry)
          {
            ++cnt;
            if (rssEntry == null)
            {
              log.info('db all, total entries: ' + cnt);
            }
            return 1;
          });
    }
    self.m_currentFeedName = f.m_name;
    self.m_currentFeed = f;
  }
  else
  {
    utils_ns.assert(f instanceof DirEntryFeed, "p_activateDirEntry: f instanceof DirEntryFeed");

    foNum = self.p_feedFindFolder(num);
    if (foNum != -1)
    {
      // Feed is inside a folder, check if folder is closed
      fo = self.m_displayList[foNum];
      if (!fo.m_isOpen)
      {
        // Activate the folder instead of the feed
        console.log('Inside a closed folder, activate folder');
        self.p_activateDirEntry(foNum);
        return;
      }
    }
    // Not in a folder or folder is open, proceeed to activate the feed
    self.m_currentFeedName = f.m_header.m_url;
    self.m_currentFeed = f;
  }

  // put current feed based on m_currentFeed
  self.p_putCurrentFeed();

  // Show selected in bold
  self.p_displayFeedsList();
}
FeedsDir.prototype.p_activateDirEntry = p_activateDirEntry;

// object FeedsDir.p_toggleFolder
function p_toggleFolder(num)
{
  var self = this;
  utils_ns.assert(num < self.m_displayList.length, "p_toggleFolder: 'num' out of bounds");

  var f = null;
  f = self.m_displayList[num];
  if (!f.m_isFolder)
    return false;

  f.m_isOpen = !f.m_isOpen;
  // Show new icon for the folder (open or closed)
  self.p_displayFeedsList();

  return true;
}
FeedsDir.prototype.p_toggleFolder = p_toggleFolder;

// object FeedsDir.p_handleDirClick
// Handles click on the list of folders and feeds (left-hand side panel)
function p_handleDirClick(ev)
{
  var self = this;

  var i = 0;
  var $item = null;
  var $ico = null;
  for (i = 0; i < self.$d.list.length; ++i)  // items: folders and feeds
  {
    $item = self.$d.list[i];

    // Clicked on item _i_?
    if (!utils_ns.clickIsInside($item, ev.pageX, ev.pageY))
      continue;

    if (i > self.m_displayList.length)
    {
      console.log('no item behind what was displayed');
      return;
    }

    $ico = utils_ns.domFindInside($item, '.xdir_icon_holder');

    if (utils_ns.clickIsInside($ico, ev.pageX, ev.pageY))
    {
      if (self.p_toggleFolder(i))
        break;
      // not a folder: fall back to showing an entry
    }

    self.p_activateDirEntry(i);
    break;
  }
}
FeedsDir.prototype.p_handleDirClick = p_handleDirClick;

// object DirEntryFeed [constructor]
// One feed entry of the display list of the left pane
function DirEntryFeed(feedHeader, dispContext)
{
  var self = this;

  self.m_isFolder = false;
  self.m_header = feedHeader;
  self.m_numUnread = 0;
  self.m_dispContext = dispContext;

  return this;
}

// object DirEntryFolder [constructor]
// One feed entry of the display list of the left pane
function DirEntryFolder(folderName, dispContext)
{
  var self = this;

  self.m_isFolder = true;
  self.m_name = folderName;
  self.m_dispContext = dispContext;
  self.m_isOpen = false;  // Folders shown as closed by default
  self.m_numUnread = 0;

  return this;
}

// object FeedsDir.p_findUpdatedFolders
// Add any new folder from foldersList
function p_findUpdatedFolders()
{
  var self = this;
  var foldersList = self.m_feedsDB.feedGetTagsList();
  var i = 0;
  var j = 0;
  var folder = null;
  var isNew = true;
  for (i = 0; i < foldersList.length; ++i)
  {
    // Verify if this folder name is not already in
    isNew = true;
    for (j = 0; j < self.m_folders.length; ++j)
    {
      if (foldersList[i] == self.m_folders[j].m_name)
      {
        isNew = false;
        break;
      }
    }
    if (!isNew)
      continue;

    // Add new DirEntryFolder object into m_folders
    folder = new DirEntryFolder(foldersList[i], new self.m_feedDisp.DispContext);
    self.m_folders.push(folder);
  }
}
FeedsDir.prototype.p_findUpdatedFolders = p_findUpdatedFolders;

// object FeedsDir.p_updateFeeds
// from the list (array) of updates transfer what is new
// param: updates array of RSSHeader
function p_updateFeeds(updates)
{
  var self = this;
  var i = 0;
  var j = 0;
  var folder = null;
  var isNew = true;
  var key = null;
  var v = null;
  var newFeed = null;
  for (i = 0; i < updates.length; ++i)
  {
    var key = updates[i].m_url;
    var v = updates[i];
    utils_ns.assert(v instanceof feeds_ns.RssHeader, "p_updateFeeds: x instanceof feeds_ns.RssHeader");

    if (self.m_feeds[key] === undefined)  // feed in our map?
    {
      // Insert new feed into m_feeds[];
      newFeed = new DirEntryFeed(v, new self.m_feedDisp.DispContext);
      self.m_feeds[key] = newFeed;
    }
    else
    {
      // New content for this feed
      // TODO: check what changed, flag that the feed changed
      // self.m_feeds[key] = v;
      log.trace("possible new content");

      // Transfer error info from updates[] to m_feeds
      self.m_feeds[key].m_header.x_errors = v.x_errors;
    }
  }
}
FeedsDir.prototype.p_updateFeeds = p_updateFeeds;

// object FeedsDir.p_removeFeeds
// the list shows what was removed from the Feeds DB
// param: removeList: array of RSSHeader
function p_removeFeeds(removedList)
{
  var self = this;
  var i = 0;
  var j = 0;
  var folder = null;
  var isNew = true;
  var key = null;
  var v = null;
  var newFeed = null;
  for (i = 0; i < removedList.length; ++i)
  {
    var key = removedList[i].m_url;
    var v = removedList[i];
    utils_ns.assert(v instanceof feeds_ns.RssHeader, "p_removeFeeds: x instanceof feeds_ns.RssHeader");

    if (self.m_feeds[key] !== undefined)  // feed in our map?
    {
      delete self.m_feeds[key];
      log.info('feed removed from directory: ' + v.m_url);
    }
  }
}
FeedsDir.prototype.p_removeFeeds = p_removeFeeds;

// object FeedsDir.p_preFirstTimePrefetch
// Prefetches in the browsers cache the first feed offered
// for convenient addition to the user
function p_preFirstTimePrefetch()
{
  var self = this;

  if (self.m_isFirstPrefetched)
    return;

  self.m_isFirstPrefetched = true;
  feeds_ns.fetchRss(self.m_urlFirstTimeOffer,
      function(c, feed, errorMsg)
      {
        if (c != 0)
        {
          var shortMsg = errorMsg.substring(0, 80) + '...';
          console.warn('rss fetch, failed: ' + shortMsg + ', for: ' + self.m_urlFirstTimeOffer);
          return;
        }

        log.info('Pre-fetch of ' + self.m_urlFirstTimeOffer + ' completed')
        // We only need it for the browser cache, discard it
      });
}
FeedsDir.prototype.p_preFirstTimePrefetch = p_preFirstTimePrefetch;

// object FeedsDir.p_displayFeedsList
// Show feeds and folders on the left-hand side panel
// Build the displayList
function p_displayFeedsList()
{
  var self = this;

  var keys = Object.keys(self.m_feeds);
  if (keys.length == 0)  // Feeds list is empty
  {
    if (self.m_isFirstTime)
    {
      // Offer one feed for convenient addition if this is the first time
      self.$d.areaAddPromptFirstTime.toggleClass('hide', false);
      self.$d.areaAddPrompt.toggleClass('hide', true);
      self.p_preFirstTimePrefetch();
    }
    else
    {
      // Offer an arrow pointing at button "Add"
      self.$d.areaAddPromptFirstTime.toggleClass('hide', true);
      self.$d.areaAddPrompt.toggleClass('hide', false);
    }
    self.$d.feedContainer.toggleClass('hide', true);
  }
  else
  {
    self.$d.areaAddPromptFirstTime.toggleClass('hide', true);
    self.$d.areaAddPrompt.toggleClass('hide', true);
  }

  // m_displayList is used to prepare the items for display
  // and for indentification of click targets on the panel
  self.m_displayList = [];
  var i = 0;
  var j = 0;
  var element = null;
  var folder = null;
  var feed = null;
  var header = null;
  var found = false;
  var key = null;
  var inFolder = 0;
  for (i = 0; i < self.m_folders.length; ++i)
  {
    folder = self.m_folders[i];

    // Count number of feeds in this folder
    inFolder = 0;
    for (j = 0; j < keys.length; ++j)
    {
      key = keys[j];
      feed = self.m_feeds[key];
      header = feed.m_header;
      utils_ns.assert(header instanceof feeds_ns.RssHeader, "p_displayFeedsList: instanceof feeds_ns.RssHeader");
      if (header.m_url == self.m_unsubscribedFeedUrl)
        continue;
      if (header.m_is_unsubscribed)
        continue;
      if (header.m_tags == folder.m_name)
        ++inFolder;
    }

    if (inFolder == 0)  // Don't show empty folders
      continue;

    self.m_displayList.push(folder);

    // Find all feeds that are tagged by this tag, insert in Display List
    for (j = 0; j < keys.length; ++j)
    {
      key = keys[j];
      feed = self.m_feeds[key];
      header = feed.m_header;
      utils_ns.assert(header instanceof feeds_ns.RssHeader, "p_displayFeedsList: instanceof feeds_ns.RssHeader");
      if (header.m_url == self.m_unsubscribedFeedUrl)
        continue;
      if (header.m_is_unsubscribed)
        continue;
      if (header.m_tags == folder.m_name)
        self.m_displayList.push(feed);
    }
  }

  // Add all feeds that are untagged
  for (j = 0; j < keys.length; ++j)
  {
    key = keys[j];
    feed = self.m_feeds[key];
    header = feed.m_header;
    if (header.m_url == self.m_unsubscribedFeedUrl)
      continue;
    if (header.m_tags == '' || header.m_tags == null)
      self.m_displayList.push(feed);
  }

  // Can the domList accomodate all entries in feedsList?
  if (self.m_displayList.length > self.$d.list.length)
  {
    var maxNew = self.m_displayList.length - self.$d.list.length;
    for (i = 0; i < maxNew; ++i)
      self.$d.panel.append($(self.$d.list[0]).clone());
  }
  // Reacquire the expanded list
  self.$d.list = utils_ns.domFindInside(self.$d.panel, '.xentry', -1);

  var x = null;
  var fe = null;
  var $e = null;
  var $a = null;
  var $unread = null;
  var $ico_fo = null;
  var $ico_fo_open = null;
  var $ico_fo_closed = null;
  var $ico_rss = null;
  var $ico = null;
  var $indent = null;
  var isCurrent = false;
  var isTagged = true;
  var isOpen = false;
  for (i = 0; i < self.m_displayList.length; ++i)
  {
    x = self.m_displayList[i];
    $e = $(self.$d.list[i]);
    $e.toggleClass('hide', false);  // Make sure entry is not hidden

    $a = utils_ns.domFindInside($e, '.xentry_text');
    $unread = utils_ns.domFindInside($e, '.xentry_unread');
    $indent = utils_ns.domFindInside($e, '.xfolder_indent');
    $ico_fo_open = utils_ns.domFindInside($e, '.ximg_folder_open');
    $ico_fo_closed = utils_ns.domFindInside($e, '.ximg_folder_closed');
    $ico_rss = utils_ns.domFindInside($e, '.ximg_rss');
    $ico = null;
    if (x.m_isFolder)
    {
      utils_ns.assert(x instanceof DirEntryFolder, "p_displayFeedsList: x instanceof DirEntryFolder");
      $a.text(x.m_name);
      $a.attr('title', "");
      $unread.text(x.m_numUnread.toString());
      if (self.m_currentFeedName == x.m_name)
        isCurrent = true;
      if (x.m_isOpen)
      {
        isOpen = true;
        $ico = $ico_fo_open;
        $ico_fo_open.toggleClass('hide', false);
        $ico_fo_closed.toggleClass('hide', true);
      }
      else
      {
        isOpen = false;  // Hide all the feeds nested in this folder
        $ico = $ico_fo_closed;
        $ico_fo_open.toggleClass('hide', true);
        $ico_fo_closed.toggleClass('hide', false);
      }
      $ico_rss.toggleClass('hide', true);
      $indent.toggleClass('hide', true);
    }
    else
    {
      utils_ns.assert(x instanceof DirEntryFeed, "p_displayFeedsList: x instanceof DirEntryFeed");

      fe = x.m_header;

      isTagged = true;  // Inside a folder
      if(fe.m_tags == '' || fe.m_tags == null)
        isTagged = false;  // Not

      if (isTagged)
      { 
        // If in a folder, hide/unhide depending on the state of the folder     
        $e = $(self.$d.list[i]);
        $e.toggleClass('hide', !isOpen);
      }

      $a.text(fe.m_title);
      $a.attr('title', fe.m_link);
      $unread.text(x.m_numUnread.toString());
      if (self.m_currentFeedName == fe.m_url)
        isCurrent = true;
      $ico = $ico_rss;
      $ico_rss.toggleClass('hide', false);
      $ico_fo_open.toggleClass('hide', true);
      $ico_fo_closed.toggleClass('hide', true);
      $indent.toggleClass('hide', !isTagged);
    }

    // Don't show in bold if this is not the current active pane
    if (!self.m_isOnFocus)
      isCurrent = false;

    $a.toggleClass('selected', isCurrent);
    $unread.toggleClass('selected', isCurrent);
    $ico.toggleClass('icon_selected', isCurrent);
    $ico.toggleClass('icon_unselected', !isCurrent);
    isCurrent = false;
  }

  // Directory empty?
  if (i == 0)
  {
    $e = $(self.$d.list[0]);
    $a = utils_ns.domFindInside($e, '.xentry_text');
    $unread = utils_ns.domFindInside($e, '.xentry_unread');
    $ico_fo_open = utils_ns.domFindInside($e, '.ximg_folder_open');
    $ico_fo_closed = utils_ns.domFindInside($e, '.ximg_folder_closed');
    $ico_rss = utils_ns.domFindInside($e, '.ximg_rss');

    // Display text "None"
    $a.text('(None)');
    $unread.text('');

    // Hide all icons
    $ico_rss.toggleClass('hide', true);
    $ico_fo_closed.toggleClass('hide', true);
    $ico_fo_open.toggleClass('hide', true);

    $e.toggleClass('hide', false);  // Make sure entry is not hidden
    ++i;
  }

  // Collapse all unused entries in self.$d.list
  for (; i < self.$d.list.length; ++i)
  {
    $e = $(self.$d.list[i]);
    $e.toggleClass('hide', true);
  }
}
FeedsDir.prototype.p_displayFeedsList = p_displayFeedsList;

// export to feeds_ns namespace
feeds_ns.FeedsDir = FeedsDir;
})();
