// feeds_import.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Management of UI for importing and exporting feeds and folders in OPML format
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
  feeds_ns = {};

(function ()
{
"use strict";

// object FeedsImport.FeedsImport [constructor]
// Instantiate one per application
function FeedsImport(feedsDB, feedsDir, panelMng)
{
  var self = this;

  var listContainer1 = utils_ns.domFind('#xopml_list');
  var opmlWarning2TextDetailedContainer = utils_ns.domFind('#xopml_error_details');

  self.m_feedsDB = feedsDB;
  self.m_feedsDir = feedsDir;
  self.m_panelMng = panelMng;
  self.m_opmlFeeds = null;  // Array of FeedEntry, after parsing of OPML xml
  self.m_parsingErrorMsgs = [];  // Parsing errors text, array if OPMLError

  self.$d =
  {
    opmlStep1: utils_ns.domFind('#ximport_opml_step1_input_file'),
    opmlStep2: utils_ns.domFind('#ximport_opml_step2_display_file'),
    opmlStep3: utils_ns.domFind('#ximport_opml_step3_importing'),
    opmlTitle: utils_ns.domFind('#opml_title'),
    opmlTotal: utils_ns.domFind('#opml_total'),
    opmlError1: utils_ns.domFind('#xopml_error1'),
    entryImportOpml: utils_ns.domFind('#ximport_opml'),
    inputOpmlFile: utils_ns.domFind('#ximport_input_opml_file'),
    inputOpmlFileArea: utils_ns.domFind('#ximport_input_opml_file_area'),
    opmlWarning2: utils_ns.domFind('#xopml_warning2'),
    opmlWarning2Text: utils_ns.domFind('#xopml_warning2_text'),
    opmlWarning2TextDetailed: opmlWarning2TextDetailedContainer,
    buttonErrorDetails: utils_ns.domFind('#xopml_show_error_details'),
    buttonErrorClose: utils_ns.domFind('#xopml_error_close'),
    errorsList: utils_ns.domFindInside(opmlWarning2TextDetailedContainer, '.xopml_error_entry', -1),
    sectionDisplayOpml: utils_ns.domFind('#ximport_opml_step2_display_file'),
    listContainer: listContainer1,
    list: utils_ns.domFindInside(listContainer1, '.xopml_entry', -1),
    btnAll1: utils_ns.domFind('#xopml_all1', -1),
    btnAll2: utils_ns.domFind('#xopml_all2', -1),
    btnNone1: utils_ns.domFind('#xopml_none1', -1),
    btnNone2: utils_ns.domFind('#xopml_none2', -1),
    btnImport: utils_ns.domFind('#xopml_import', -1),
    btnCancel: utils_ns.domFind('#xopml_cancel', -1),
    importCounter: utils_ns.domFind('#ximport_counter')
  };
  // Help strict mode detect misstyped fields
  Object.preventExtensions(self.$d);

  self.$d.inputOpmlFile.on('change', function()
      {
        var f = this.files[0]
        self.handleOPMLFile(f);
      });

  self.$d.btnAll1.on('click', function ()
      {
        self.selectAllEntries();
      });

  self.$d.btnAll2.on('click', function ()
      {
        self.selectAllEntries();
      });

  self.$d.btnNone1.on('click', function ()
      {
        self.deselectAllEntries();
      });

  self.$d.btnNone2.on('click', function ()
      {
        self.deselectAllEntries();
      });

  self.$d.buttonErrorDetails.on('click', function ()
      {
        self.$d.opmlWarning2TextDetailed.toggleClass('hide');
      });

  self.$d.buttonErrorClose.on('click', function ()
      {
        self.$d.opmlWarning2.toggleClass('hide', true); // Hide the error msg area
      });

  self.$d.btnImport.on('click', function ()
      {
        self.handleImport();
      });

  self.$d.btnCancel.on('click', function ()
      {
        self.activateStep1();
      });

  // Help strict mode detect miss-typed fields
  Object.preventExtensions(this);

  return this;
}

// Object FeedEntry.clearInputField
function clearInputField()
{
  var self = this;

  self.m_parsingErrorMsgs = [];

  self.$d.inputOpmlFile.val('');  // Clear the file name
  self.$d.opmlError1.toggleClass('hide', true); // Hide the error msg area
  self.$d.opmlWarning2.toggleClass('hide', true); // Hide the warning msg area
}
FeedsImport.prototype.clearInputField = clearInputField;

// Object FeedEntry.showError1
// Show error for step 1
function showError1(msg)
{
  var self = this;

  self.$d.opmlError1.text(msg); // Hide the error msg area
  self.$d.opmlError1.toggleClass('hide', false); // Show the error msg area
}
FeedsImport.prototype.showError1 = showError1;

// Object FeedEntry.showWarning2
// Show a warning message while in step 2
function showWarning2(msg)
{
  var self = this;

  var i = 0;

  self.$d.opmlWarning2Text.text(msg); // Hide the error msg area

  // Can the domList accomodate all error msg entries?
  if (self.m_parsingErrorMsgs.length > self.$d.errorsList.length)
  {
    var maxNew = self.m_parsingErrorMsgs.length - self.$d.errorsList.length;
    for (i = 0; i < maxNew; ++i)
      self.$d.opmlWarning2TextDetailed.append($(self.$d.errorsList[0]).clone());
  }
  // Reacquire the expanded list
  self.$d.errorsList = utils_ns.domFindInside(self.$d.opmlWarning2TextDetailed, '.xopml_error_entry', -1);

  var x = 0;
  var $e = null;
  var $errorEntry = null;
  var $errorTitle = null;
  var $errorInfo = null;
  for (i = 0; i < self.m_parsingErrorMsgs.length; ++i)
  {
    x = self.m_parsingErrorMsgs[i];
    utils_ns.assert(x instanceof OPMLError, 'opml: x instanceof OPMLError');
    $e = jQuery(self.$d.errorsList[i]);

    $errorTitle = utils_ns.domFindInside($e, '.xopml_error_title');
    $errorInfo = utils_ns.domFindInside($e, '.xopml_error_info');

    $errorTitle.text(x.m_title);
    $errorInfo.text(x.m_info);

    $e.toggleClass('hide', false);  // Make sure entry is not hidden
  }

  // Collapse all unused entries in self.$d.list
  for (; i < self.$d.errorsList.length; ++i)
  {
    $e = jQuery(self.$d.errorsList[i]);
    $e.toggleClass('hide', true);
  }

  self.$d.opmlWarning2.toggleClass('hide', false); // Show the error msg area
  self.$d.opmlWarning2TextDetailed.toggleClass('hide', true); // Keep details area hidden
}
FeedsImport.prototype.showWarning2 = showWarning2;

// Object FeedEntry.FeedEntry [constructor]
function FeedEntry(folder, feedUrl, feedSiteUrl, feedTitle)
{
  // If it is a folder name entry, it is only the folder and nothing else
  this.m_folder = folder;
  this.m_isFolder = true;
  this.m_feedUrl = null;
  this.m_feedSiteUrl = null;
  this.m_feedTitle = null;
  if (feedUrl != null)
  {
    // Not a folder, an RSS feed
    this.m_isFolder = false;
    this.m_feedUrl = feedUrl;
    this.m_feedSiteUrl = feedSiteUrl;
    this.m_feedTitle = feedTitle;
  }

  this.m_alreadySubscribed = false;
  this.m_selected = true;

  // Help strict mode detect misstyped fields
  Object.preventExtensions(this);

  return this;
}

// object FeedsImport.printFeedEntry
// print FeedEntry in the log
function printFeedEntry(entry)
{
  utils_ns.assert(entry instanceof FeedEntry, 'opml: printFeedEntry: x instanceof FeedEntry');
  if (entry.m_isFolder)
    log.info('FOLDER: ' + entry.m_folder);
  else
    log.info('RSS: ' + entry.m_feedUrl + ' into ' + entry.m_folder);
}
FeedsImport.prototype.printFeedEntry = printFeedEntry;

// object FeedsImport.compareOPML
// Helpef function:
// comparator for sorting of opmlArray so that folders are in alphabetical order
// and inside the folders the feeds are sorted alphabetically by title
function compareOPML(e1, e2)
{
  if (e1.m_folder == e2.m_folder)
  {
    // NOTE: e1.m_folder and/or e2.m_folder might be null
    if (e1.m_isFolder)   // Folder name should be at the top of the group
      return -1;
    else if (e2.m_isFolder)
      return 1;
    else if (e1.m_feedTitle == e2.m_feedTitle)
      return 0;
    else if (e1.m_feedTitle < e2.m_feedTitle)
      return -1;
    else
      return 1; // e1.m_feedTitle > e2.m_feedTitle
  }
  else if (e1.m_folder == null)  // Entries with no folder should go to the end
    return -1;
  else if (e2.m_folder == null)
    return 1;
  else if (e1.m_folder < e2.m_folder)
    return -1;
  else
    return 1;
}
FeedsImport.prototype.compareOPML = compareOPML;

// Object OPMLError.OPMLError [constructor]
function OPMLError(title, info)
{
  this.m_title = title;
  this.m_info = info;

  // Help strict mode detect misstyped fields
  Object.preventExtensions(this);

  return this;
}

// object FeedsImport.addErrorMsg
// Accumulate error messages into m_parseErrorMsg
function addErrorMsg(title, msg)
{
  var self = this;

  self.m_parsingErrorMsgs.push(new OPMLError(title, msg));
}
FeedsImport.prototype.addErrorMsg = addErrorMsg;

// object FeedsImport.parseOPML
// Parse OPML XML
// Returns an array of RSS entries and folders
function parseOPML($opml, cbSetTitle)
{
  var self = this;

  var i = 0;
  var j = 0;
  var opmlArray = [];
  var opmlEntry = null;
  var numEntries = jQuery($opml).children().length;
  var numFolderEntries = 0;
  var titleStr = null;
  var $topEntry = null;
  var $entry = null;
  var tagNameStr = null;
  var feedUrlStr = null;
  var feedSiteUrlStr = null;
  var typeStr = null;
  var folderNameStr = null;
  var errorMsg = null;
  var errorInfo = null;
  for (i = 0; i < numEntries; ++i)
  {
    $topEntry = jQuery($opml).children().eq(i);
    tagNameStr = $topEntry.prop('tagName');
    if (tagNameStr == 'TITLE')
    {
      titleStr = $topEntry.text();
      cbSetTitle(titleStr);
    }
    else if (tagNameStr == 'OUTLINE')
    {
      titleStr = $topEntry.attr('title');
      feedUrlStr = $topEntry.attr('xmlurl');
      feedSiteUrlStr = $topEntry.attr('htmlurl');
      // Is it folder or an rss entry, check attr 'type'
      typeStr = $topEntry.attr('type');
      if (typeStr == 'rss')
      {
        if (feedUrlStr === undefined)
        {
            errorInfo = $topEntry.prop('outerHTML');  // The entire XML tag, all attributues and values
            errorMsg = 'parseOPML: Missing feed URL: ' + errorInfo;
            log.warn(errorMsg);

            self.addErrorMsg('Missing feed URL:', errorInfo);
            continue;
        }

        // RSS feed at top level, this is outside any folders
        opmlEntry = new FeedEntry(null, feedUrlStr, feedSiteUrlStr, titleStr);
        opmlArray.push(opmlEntry);
      }
      else if(typeStr === undefined)
      {
        // Folder
        opmlEntry = new FeedEntry(titleStr, null, null, null);
        opmlArray.push(opmlEntry);

        // Process all entries inside the folder
        numFolderEntries = $topEntry.children().length;
        folderNameStr = titleStr;
        for (j = 0; j < numFolderEntries; ++j)
        {
          $entry = jQuery($topEntry).children().eq(j);

          titleStr = $entry.attr('title');
          feedUrlStr = $entry.attr('xmlurl');
          feedSiteUrlStr = $entry.attr('htmlurl');
          typeStr = $entry.attr('type');

          if (typeStr != 'rss')
          {
            errorInfo = $entry.prop('outerHTML');  // The entire XML tag, all attributues and values
            errorMsg = 'parseOPML: Not an RSS entry: ' + errorInfo;
            log.warn(errorMsg);

            self.addErrorMsg('Not an RSS entry:', errorInfo);
            continue;
          }

          if (feedUrlStr === undefined)
          {
              errorInfo = $entry.prop('outerHTML');  // The entire XML tag, all attributues and values
              errorMsg = 'parseOPML: Missing feed URL: ' + errorInfo;
              log.warn(errorMsg);

              self.addErrorMsg('Missing feed URL:', errorInfo);
              continue;
          }

          opmlEntry = new FeedEntry(folderNameStr, feedUrlStr, feedSiteUrlStr, titleStr);
          opmlArray.push(opmlEntry);
        }
      }
      else
      {
        errorInfo = $topEntry.prop('outerHTML');  // The entire XML tag, all attributues and values
        errorMsg = 'parseOPML: Not an RSS entry: ' + errorInfo;
        log.warn(errorMsg);

        self.addErrorMsg('Not an RSS entry:', errorInfo);
      }
    }
    else
    {
      errorInfo = $topEntry.prop('outerHTML');  // The entire XML tag, all attributues and values
      errorMsg = 'parseOPML: Unknown tag: ' + errorInfo;
      log.warn(errorMsg);

      self.addErrorMsg('Unknown tag:', errorInfo);
    }
  }

  opmlArray.sort(self.compareOPML);

  for (i = 0; i < opmlArray.length; ++i)
    self.printFeedEntry(opmlArray[i]);

  return opmlArray;
}
FeedsImport.prototype.parseOPML = parseOPML;

// object FeedsImport.selectAllEntries
// Handle action of button "All" -- select all entries
function selectAllEntries()
{
  var self = this;

  var i = 0;
  var x = null;
  var $e = null;
  var $rssEntry = null;
  var $checkbox = null;
  for (i = 0; i < self.m_opmlFeeds.length; ++i)
  {
    x = self.m_opmlFeeds[i];
    utils_ns.assert(x instanceof FeedEntry, 'opml: selectAllEntries: x instanceof FeedEntry');

    if (x.m_isFolder)
      continue;

    if (x.m_alreadySubscribed)  // Disabled and checkbox is permanently OFF
      continue;

    $e = jQuery(self.$d.list[i]);

    x.m_selected = true;

    $rssEntry = utils_ns.domFindInside($e, '.xopml_feed_entry');
    $checkbox = utils_ns.domFindInside($rssEntry, '.xopml_checkbox');
    $checkbox.prop('checked', true);
  }
}
FeedsImport.prototype.selectAllEntries = selectAllEntries;

// object FeedsImport.deselectAllEntries
// Handle action of button "None" -- deselect all entries
function deselectAllEntries()
{
  var self = this;

  var i = 0;
  var x = null;
  var $e = null;
  var $rssEntry = null;
  var $checkbox = null;
  for (i = 0; i < self.m_opmlFeeds.length; ++i)
  {
    x = self.m_opmlFeeds[i];
    utils_ns.assert(x instanceof FeedEntry, 'opml: deselectAllEntries: x instanceof FeedEntry');

    if (x.m_isFolder)
      continue;

    if (x.m_alreadySubscribed)  // Disabled and checkbox is permanently OFF
      continue;

    $e = jQuery(self.$d.list[i]);

    x.m_selected = false;

    $rssEntry = utils_ns.domFindInside($e, '.xopml_feed_entry');
    $checkbox = utils_ns.domFindInside($rssEntry, '.xopml_checkbox');
    $checkbox.prop('checked', false);
  }
}
FeedsImport.prototype.deselectAllEntries = deselectAllEntries;

// object FeedsImport.displayOPML
//
// It is called only once after parsing. All other actions manipulate
// individual DOM elements.
function displayOPML()
{
  var self = this;

  var i = 0;

  // Can the domList accomodate all entries in opmlFeeds?
  if (self.m_opmlFeeds.length > self.$d.list.length)
  {
    var maxNew = self.m_opmlFeeds.length - self.$d.list.length;
    for (i = 0; i < maxNew; ++i)
      self.$d.listContainer.append($(self.$d.list[0]).clone());
  }
  // Reacquire the expanded list
  self.$d.list = utils_ns.domFindInside(self.$d.listContainer, '.xopml_entry', -1);

  //
  // Display the entries imported from the OPML list
  var x = null;
  var idx = 0;
  var $e = null;
  var $folder = null;
  var $rssEntry = null;
  var $title = null;
  var $rssUrl = null;
  var $siteUrl = null;
  var $siteIconHolder = null;
  var $siteIconEmpty = null;
  var $checkbox = null;
  var $labelSubscribed = null;
  for (i = 0; i < self.m_opmlFeeds.length; ++i)
  {
    x = self.m_opmlFeeds[i];
    utils_ns.assert(x instanceof FeedEntry, 'opml: displayOPML: x instanceof FeedEntry');
    $e = jQuery(self.$d.list[i]);

    $e.toggleClass('hide', false);  // Make sure entry is not hidden

    $folder = utils_ns.domFindInside($e, '.xopml_folder');
    $rssEntry = utils_ns.domFindInside($e, '.xopml_feed_entry');
    if (x.m_isFolder)
    {
      $title = utils_ns.domFindInside($folder, '.xopml_folder_name');
      $title.text(x.m_folder);

      $rssEntry.toggleClass('hide', true);
      $folder.toggleClass('hide', false);
    }
    else
    {
      $title = utils_ns.domFindInside($rssEntry, '.xopml_title_source');
      $rssUrl = utils_ns.domFindInside($rssEntry, '.xopml_url');
      $siteUrl = utils_ns.domFindInside($rssEntry, '.xopml_site_url');
      $siteIconHolder =  utils_ns.domFindInside($rssEntry, '.xsite_icon_holder');
      $siteIconEmpty =  utils_ns.domFindInside($rssEntry, '.xsite_icon_empty');
      $checkbox = utils_ns.domFindInside($rssEntry, '.xopml_checkbox');
      $labelSubscribed = utils_ns.domFindInside($rssEntry, '.xopml_subscribed');

      $title.text(x.m_feedTitle);
      $rssUrl.text(x.m_feedUrl);
      if (x.m_feedSiteUrl == null)
      {
        // No site URL, show empty space to align the columns
        $siteIconHolder.toggleClass('hide', true);
        $siteIconEmpty.toggleClass('hide', false);
      }
      else
      {
        $siteUrl.attr('href', x.m_feedSiteUrl);

        $siteIconHolder.toggleClass('hide', false);
        $siteIconEmpty.toggleClass('hide', true);
      }

      $folder.toggleClass('hide', true);
      $rssEntry.toggleClass('hide', false);

      // Setup the check box depending on if the feed is already subscribed
      idx = self.m_feedsDB.feedListSearch(x.m_feedUrl);
      if (idx >= 0)
      {
        // This entry is already subscribed
        $checkbox.prop('checked', false);
        $checkbox.prop('disabled', true);
        $labelSubscribed.toggleClass('hide', false); // Show '[subscribed]'
        x.m_selected = false;
        x.m_alreadySubscribed = true;
      }
      else
      {
        $checkbox.prop('checked', true);
        $checkbox.prop('disabled', false);
        $labelSubscribed.toggleClass('hide', true); // Show '[subscribed]'
      }
    }
  }

  // Collapse all unused entries in self.$d.list
  for (; i < self.$d.list.length; ++i)
  {
    $e = jQuery(self.$d.list[i]);
    $e.toggleClass('hide', true);
  }
}
FeedsImport.prototype.displayOPML = displayOPML;

// object FeedsImport.handleOPMLFile
// Handles new OPML file input from user
function handleOPMLFile(file)
{
  var self = this;

  self.$d.opmlTitle.text('No title');

  var reader = new FileReader();
  reader.onload = function(evt)
      {
        if (evt.target.readyState == FileReader.DONE)  // DONE == 2
        {
          var xmlStr = evt.target.result;
          // TODO: check for max safe file size
          //alert(f.name + ' ' + f.size + ' bytes => ' + s.substr(0, 24));
          var $parsed = jQuery(xmlStr);
          if ($parsed.length == 0)
            alert('not a valid XML');

          var i = 0;
          var $opml = null;
          for(i = 0; i < $parsed.length; ++i)
          {
            if($parsed[i].nodeName == 'OPML')
            {
              $opml = $parsed[i];
              break;
            }
          }
          if ($opml == null)
          {
            self.showError1('OPML error: tag \'opml\' not found');
            return;
          }
          if (jQuery($opml).prop('tagName') != 'OPML')
          {
            self.showError1('OPML error: tag \'opml\' not found');
            return;
          }
          var version = jQuery($opml).attr('version');
          if (version != '1.0')
          {
            self.showError1('OPML error: unsupported version of opml: ' + version);
            return;
          }

          self.m_opmlFeeds = self.parseOPML($opml, function(opmlTitle)
              {
                // Display title of OPML feed (immediate action from
                // parsing, no need to store it anywhere)
                self.$d.opmlTitle.text(opmlTitle);
              });

          if (self.m_parsingErrorMsgs.length > 0)
            self.showWarning2('OPML parser encountered ' + self.m_parsingErrorMsgs.length + ' errors.');

          // Activate area for step2 -- preview and selection of feeds
          // from the OPML file
          self.$d.opmlStep1.toggleClass('hide', true);
          self.$d.opmlStep2.toggleClass('hide', false);
          self.$d.opmlStep3.toggleClass('hide', true);

          // Display the entries
          self.$d.opmlTotal.text(self.m_opmlFeeds.length + ' entries');
          self.displayOPML();
        }
      };

  var s = reader.readAsText(file);
}
FeedsImport.prototype.handleOPMLFile = handleOPMLFile;

// object FeedsImport.handleImport
// Handle click on button "Import"
function handleImport()
{
  var self = this;

  self.$d.importCounter.text('Importing...');

  // Activate area for step3 -- imports counter
  self.$d.opmlStep1.toggleClass('hide', true);
  self.$d.opmlStep2.toggleClass('hide', true);
  self.$d.opmlStep3.toggleClass('hide', false);

  var i = 0;
  var x = null;
  var $e = null;
  var $rssEntry = null;
  var $checkbox = null;
  var cbox_val = false;
  var importCnt = 0;
  // Walk all m_opmlFeeds entries if checkbox is ON, then import
  for (i = 0; i < self.m_opmlFeeds.length; ++i)
  {
    x = self.m_opmlFeeds[i];
    utils_ns.assert(x instanceof FeedEntry, 'opml: displayOPML: x instanceof FeedEntry');
    if (x.m_isFolder)
      continue;  // Process only the RSS entries, skip the folders
    $e = jQuery(self.$d.list[i]);
    $rssEntry = utils_ns.domFindInside($e, '.xopml_feed_entry');
    $checkbox = utils_ns.domFindInside($rssEntry, '.xopml_checkbox');

    cbox_val = $checkbox.prop('checked');
    if (!cbox_val)  // Checkbox is OFF
    {
      log.info('skip import for ' + x.m_feedUrl);
      continue;
    }

    ++importCnt;
    self.$d.importCounter.text('Importing(' + importCnt + ')...');
    log.info("handleImport: RSS import requested: " + x.m_feedUrl);
    // Checkbox is ON = do import
    (function()  // scope
    {
      var urlRss = x.m_feedUrl;
      self.m_feedsDB.feedAddByUrl(x.m_feedUrl,
          function()
          {
            --importCnt;
            self.$d.importCounter.text('Importing(' + importCnt + ')...');

            // Feed's _add_ operation is complete
            // (feed data is in the DB)
            log.info("handleImport: RSS imported into DB: " + urlRss);

            if (importCnt == 0)
            {
              self.m_feedsDir.p_activateDirEntry(0);
              self.m_panelMng.p_activatePane(0);  // Activate feeds display
            }
          });
    })();

    if (x.m_folder != null)
    {
      self.m_feedsDB.feedSetTags(x.m_feedUrl, x.m_folder);
      log.info('import: in folder ' + x.m_folder + ' url:' + x.m_feedUrl);
    }
  }
}
FeedsImport.prototype.handleImport = handleImport;

// object FeedsImport.activateStep1
function activateStep1()
{
  var self = this;

  // Activate pane for step 1 (Select an OPML file)
  self.clearInputField();  // Clear in case there is anything from previous input

  self.$d.opmlStep1.toggleClass('hide', false);
  self.$d.opmlStep2.toggleClass('hide', true);
  self.$d.opmlStep3.toggleClass('hide', true);
}
FeedsImport.prototype.activateStep1 = activateStep1;

// object FeedsImport.onFocusLost
function onFocusLost()
{
  var self = this;

  self.$d.entryImportOpml.toggleClass('selected', false);
}
FeedsImport.prototype.onFocusLost = onFocusLost;

// object FeedsImport.onFocus
function onFocus()
{
  var self = this;

  self.$d.entryImportOpml.toggleClass('selected', true);

  // Check for the various File API support.
  if (!(window.File && window.FileReader && window.FileList && window.Blob))
  {
    self.showError1('Generic: The File APIs are not fully supported in this browser.');
    self.$d.inputOpmlFileArea.toggleClass('hide', true);  // Hide the input
  }

  self.activateStep1();
}
FeedsImport.prototype.onFocus = onFocus;

// export to feeds_ns namespace
feeds_ns.FeedsImport = FeedsImport;
})();
