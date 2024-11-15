// feeds_disp.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

//
// Panel for display and navigation of RSS feed entries
//

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
{
  feeds_ns = {};
}

(function ()
{
"use strict";

// object FeedDisp.FeedDisp [constructor]
// Instantiate one per application
function FeedDisp($feedDispPanel)
{
  var self = this;

  self.m_cb = null;
  self.m_currentDispContext = null;

  self.$d =
  {
    dispPanel: $feedDispPanel,
    rssEntries: null
  }

  // Attach UI events handler to the DOM of the left hand side pane
  self.$d.dispPanel.on('click', function (e)
    {
      log.info('Disp panel click');
      self.p_handleDispClick(e)
    });

  Object.preventExtensions(this);
  return this;
}

// object FeedDisp.setCBHandlers
function setCBHandlers(cb)
{
  var self = this;

  self.m_cb = cb;
}
FeedDisp.prototype.setCBHandlers = setCBHandlers;

// object FeedDisp.p_markAsRead
// Mark an entry as read/unread
function p_markAsRead(screenIndex, isRead, isRemoteAction)
{
  var self = this;

  var $rssEntry = $(self.$d.rssEntries[screenIndex]);
  var $bar = utils_ns.domFindInside($rssEntry, '.xbar');
  var $markedRead = utils_ns.domFindInside($bar, '.xmarked_read');
  var $markedUnread = utils_ns.domFindInside($bar, '.xmarked_unread');
  var $feedUrl = utils_ns.domFindInside($rssEntry, '.xbody_feed_source_url');
  var is_too_old = $rssEntry.attr('rss_is_too_old') != 'false';

  if (is_too_old)
    isRead = true;

  // Mark the selected as read/unread
  $bar.toggleClass('unread', !isRead);
  // Show appropriate icon for marked as read/unrad
  if (!is_too_old)  // Only if not both hidden
  {
    $markedRead.toggleClass("hide", !isRead);
    $markedUnread.toggleClass("hide", isRead);
  }

  var feedUrl = $feedUrl.attr('href');
  var entryHash = $rssEntry.attr('rss_hash');

  // If it isRemoteAction, this is already reflected in the database
  if (!isRemoteAction)
    self.m_cb.markAsRead(entryHash, isRead, feedUrl);
}
FeedDisp.prototype.p_markAsRead = p_markAsRead;

// object FeedDisp.markAsRead
// Mark as read an entry that is already displayed
// This is not a fast function, call it only if an entry is on the screen,
// it is called as a result of a remote table event (entry marked as read
// on another compter).
function markAsRead(entryHash, isRead)
{
  var self = this;

  var i = 0;
  var $rssEntry = null;
  var hash = null;
  var $d = {};

  utils_ns.assert(self.$d.rssEntries != null, "markAsRead: $rssEntries is uninitialized");

  for (i = 0; i < self.$d.rssEntries.length; ++i)
  {
    $rssEntry = $(self.$d.rssEntries[i]);

    hash = $rssEntry.attr('rss_hash');
    if (hash == entryHash)
    {
      self.p_markAsRead(i, isRead, true);
      break;
    }
  }

  utils_ns.assert(hash == entryHash, "markAsRead: entryHash not found");
}
FeedDisp.prototype.markAsRead = markAsRead;

// object FeedDisp.setAsCurrent
// Display a new item as current
function setAsCurrent(newActive)
{
  var self = this;

  utils_ns.assert(newActive >= 0 && newActive < self.$d.rssEntries.length,
                  "p_markAsActive: newActive is out of range");

  var d = self.m_currentDispContext;
  utils_ns.assert(d instanceof DispContext, "p_handleDispClick: x instanceof DispContext");
  var $body = null;
  var $bar = null;
  var $rssEntry = self.$d.rssEntries[d.m_currentItem];

  // Unmark any previously active item
  if (d.m_currentItem != -1)
  {
    // Deselect the top bar area
    $bar = utils_ns.domFindInside($rssEntry, '.xbar');
    $bar.toggleClass('selected', false);

    if (d.m_currentItem != newActive)  // Hide old one only if we are moving into a new one
    {
      $body = utils_ns.domFindInside($rssEntry, '.xbody');
      $body.toggleClass('hide', true);
    }
  }

  // Highlight the newly active
  d.m_currentItem = newActive;
  $rssEntry = self.$d.rssEntries[d.m_currentItem];
  $bar = utils_ns.domFindInside($rssEntry, '.xbar');
  $bar.toggleClass('selected', true);
}
FeedDisp.prototype.setAsCurrent = setAsCurrent;

// object FeedDisp.p_handleDispClick
// Handles mouse click anywhere on the display of the feeds contents
function p_handleDispClick(ev)
{
  var self = this;

  var i = 0;
  var d = null;
  var $bar = null;
  var $body = null;
  var $barUrl = null;
  var $barIconRead = null;
  var $barIconUnread = null;
  var $unfoldedToFeed = null;
  var $unfoldedToFeedUrl = null;
  var $rssEntry = null;
  var feedUrl = null;
  var newCurrent = -1;
  for (i = 0; i < self.$d.rssEntries.length; ++i)  // items: feeds contents entries
  {
    $rssEntry = $(self.$d.rssEntries[i]);

    // Clicked on item _i_?
    if (!utils_ns.clickIsInside($rssEntry, ev.pageX, ev.pageY))
      continue;

    log.info('click on ' + i);

    $unfoldedToFeed = utils_ns.domFindInside($rssEntry, '.xbody_to_feed');
    if (utils_ns.clickIsInside($unfoldedToFeed, ev.pageX, ev.pageY))
    {
      $unfoldedToFeedUrl = utils_ns.domFindInside($rssEntry, '.xbody_feed_source_url');
      feedUrl = $unfoldedToFeedUrl.attr('href');
      log.info('click on go_to_feed area ' + i, ' feed is: ' + feedUrl);
      self.m_cb.gotoFeed(feedUrl);
      break;
    }

    // Process click on the bar area
    $bar = utils_ns.domFindInside($rssEntry, '.xbar');
    if (!utils_ns.clickIsInside($bar, ev.pageX, ev.pageY))
      continue;

    d = self.m_currentDispContext;
    utils_ns.assert(d instanceof DispContext, "p_handleDispClick: x instanceof DispContext");

    // Highlight this entry as current
    newCurrent = i;

    $barUrl = utils_ns.domFindInside($rssEntry, '.xurl');
    if (utils_ns.clickIsInside($barUrl, ev.pageX, ev.pageY))
    {
      log.info('click on link area ' + i);
      self.p_markAsRead(i, true, false);
      break;
    }

    $barIconRead = utils_ns.domFindInside($rssEntry, '.xmarked_read');
    if (utils_ns.clickIsInside($barIconRead, ev.pageX, ev.pageY))
    {
      log.info('click on marked_read area ' + i);
      self.p_markAsRead(i, false, false);
      break;
    }

    $barIconUnread = utils_ns.domFindInside($rssEntry, '.xmarked_unread');
    if (utils_ns.clickIsInside($barIconUnread, ev.pageX, ev.pageY))
    {
      log.info('click on marked_unread area ' + i);
      self.p_markAsRead(i, true, false);
      break;
    }

    log.info('click on fold/unfold area ' + i);

    if (d.m_currentItem == i)  // Already current, then toggle
    {
      $body = utils_ns.domFindInside($rssEntry, '.xbody');
      $body.toggleClass('hide');
    }
    else
    {
      // Unfold
      $body = utils_ns.domFindInside($rssEntry, '.xbody');
      $body.toggleClass('hide', false);
    }

    self.p_markAsRead(i, true, false);
    break;
  }

  if (newCurrent != -1)
    self.setAsCurrent(newCurrent);
}
FeedDisp.prototype.p_handleDispClick = p_handleDispClick;

// object FeedDisp.DispContext [constructor]
// Creates an object that stores the context of displaying a feed
function DispContext()
{
  var self = this;

  self.m_topTime = null;
  self.m_bottomTime = null;
  self.m_curPage = 0;
  self.m_numToLoad = 50;
  self.m_totalNumEntries = 0;  // Incremented by reading the entire feed from the IndexedDB

  // TODO: when time comes to implement navigation by items on the page
  self.m_currentItem = -1;

  return this;
}
FeedDisp.prototype.DispContext = DispContext;

// object DispContext.incrementNumEntries
// Update total number of entries. This can happen only when we are reading page 0.
function incrementNumEntries()
{
  var self = this;
  if (self.m_curPage == 0)
    ++self.m_totalNumEntries;
}
DispContext.prototype.incrementNumEntries = incrementNumEntries;

// object DispContext.getCurPageNumers
// Return current page number and total number of pages
function getCurPageNumers()
{
  var self = this;

  var r = {};
  r.curPage = self.m_curPage;
  r.totalPages = Math.floor((self.m_totalNumEntries + self.m_numToLoad) / self.m_numToLoad);

  return r;
}
DispContext.prototype.getCurPageNumers = getCurPageNumers;

// object DispContext.setStartAndEndTime
// Sets the time range of what is displayed on the screen
// This is used to form DB requests for Next (newer) and Prev (older) pages
function setStartAndEndTime(m_topTime, m_bottomTime)
{
  var self = this;

  self.m_topTime = m_topTime;
  self.m_bottomTime = m_bottomTime;
}
DispContext.prototype.setStartAndEndTime = setStartAndEndTime;

// object FeedDisp.feedDisplay
// Display feed on the right-hand side panel
// Set display context for the current feed
function feedDisplay(items, dispContext)
{
  var self = this;

  self.m_currentDispContext = dispContext;
  self.m_currentDispContext.m_currentItem = -1;  // no item is currently selected

  // Check if there are enough DOM entries to display the entire feed
  self.$d.rssEntries = utils_ns.domFindInside(self.$d.dispPanel, '.rss_entry', -1);
  var expandBy = items.length - self.$d.rssEntries.length;
  var i = 0;
  var j = 0;
  var $e = null;
  if (expandBy > 0)
  {
    $e = utils_ns.domFindInside(self.$d.dispPanel, '.rss_entry', -1);
    for (i = 0; i < expandBy; ++i)
      self.$d.dispPanel.append($e.clone());
    // Acquire the newly created entries
    self.$d.rssEntries = utils_ns.domFindInside(self.$d.dispPanel, '.rss_entry', -1);
  }

  var $d =
  {
    // bar
    bar: null,
    srcTitle: null,
    title: null,
    snippet: null,
    url: null,
    body: null,
    // body
    btitle: null,
    burl: null,
    bfeed: null
  };
  var t = '';
  var e = null;
  var rssDom = null;
  var $rssEntry = null;
  var now = new Date();
  var t1 = 0;
  var t2 = 0;
  var d = 0;
  var since = '';
  var is_read = false;
  var links = [];
  var images = [];
  var cssStyle = '';
  for (i = 0; i < self.$d.rssEntries.length; ++i)
  {
    $rssEntry = $(self.$d.rssEntries[i]);
    if (i >= items.length)
    {
      $rssEntry.toggleClass('hide', true);
      continue;
    }
    else
      $rssEntry.toggleClass('hide', false);

    //e = feedHeader.x_items[hkeys[i]];
    e = items[i];

    $d.bar = utils_ns.domFindInside($rssEntry, '.xbar');

    $d.srcTitle = utils_ns.domFindInside($d.bar, '.xtitle_source');
    $d.srcTitle.text(e.x_header.m_title);

    $d.title = utils_ns.domFindInside($d.bar, '.xtitle');
    $d.title.text(e.m_title);

    $d.snippet = utils_ns.domFindInside($d.bar, '.xsnippet');
    // concert snippet to text
    // ("e.m_description" is sanitized, safe to run parseHTML() on it)
    try
    {
      rssDom = jQuery.parseHTML(e.m_description);
      t = $(rssDom).text();
      $d.snippet.text(t.substr(0, 120));
    }
    catch(e)
    {
      log.warn('Failed to process RSS body: ' + e.m_description);
      $d.snippet.text('Failed RSS body');
    }

    $d.marked_read = utils_ns.domFindInside($d.bar, '.xmarked_read');
    $d.marked_unread = utils_ns.domFindInside($d.bar, '.xmarked_unread');
    is_read = e.m_is_read;
    if (feeds_ns.isTooOldRssEntry(e))
    {
      // Disable the read/unread control
      is_read = true;
      $d.marked_read.toggleClass("hide", true);
      $d.marked_unread.toggleClass("hide", true);
      // Store the hash of the RSS entry into the DOM
      $rssEntry.attr('rss_is_too_old', true);
    }
    else
    {
      // Show appropriate icon for marked as read/unrad
      $d.marked_read.toggleClass("hide", !e.m_is_read);
      $d.marked_unread.toggleClass("hide", e.m_is_read);
      $rssEntry.attr('rss_is_too_old', false);
    }

    $d.url = utils_ns.domFindInside($d.bar, '.xurl');
    $d.url.attr('href', e.m_link);

    $d.date = utils_ns.domFindInside($d.bar, '.xdate');
    t1 = now.getTime();
    t2 = e.m_date.getTime();
    d = (t1 - t2);  // diff in milliseconds
    d = d / (1000 * 60);  // diff in minutes
    since = "zz";
    if (d < 60)
      since = "1h";
    else
      if (d < 24 * 60)
        since = Math.round(d / 60) + 'h';
      else
        since = Math.round(d / (24 * 60)) + 'd';
    $d.date.text(since);

    // Show bar in bold if entry is unread
    $d.bar.toggleClass("unread", !is_read);
    $d.bar.toggleClass('selected', false);  // Start in state "not current"

    // Fill in the body
    $d.body = utils_ns.domFindInside($rssEntry, '.xbody');
    $d.body.toggleClass('hide', true);  // Start in state "folded"

    $d.btitle = utils_ns.domFindInside($d.body, '.xbody_title');
    $d.btitle.text(e.m_title);
    $d.btitle.attr('href', e.m_link);

    $d.bToFeed = utils_ns.domFindInside($d.body, '.xbody_to_feed');

    $d.bfeed = utils_ns.domFindInside($d.body, '.xbody_feed_url');
    $d.bfeedsrc = utils_ns.domFindInside($d.body, '.xbody_feed_source_url');
    $d.bfeed.text(e.x_header.m_title);
    $d.bfeed.attr('href', e.x_header.m_link);
    $d.bfeedsrc.attr('href', e.x_header.m_url);

    $d.bentry = utils_ns.domFindInside($d.body, '.xbody_entry');
    // "e.m_description" is sanitized before storing into table 'rss_data', it is
    // now safe to put as HTML
    try
    {
      $d.bentry.html(e.m_description);
    }
    catch (e)
    {
      $d.bentry.text('Bad RSS data: ' + e.m_description);
    }

    links = $d.bentry.find('a');
    for (j = 0; j < links.length; ++j)
    {
      /* TODO: examine if a link missed leading "http:/domain.com" portion */
      /* Make sure links open into a new window (tab) */
      $(links[j]).attr('target', '_blank')
    }

    images = $d.bentry.find('img'); 
    for (j = 0; j < images.length; ++j)
    {
      /* Make sure images are not unconstrained */
      cssStyle = $(images[j]).attr('style');
      if (cssStyle != '')
          cssStyle = cssStyle + '; '
      cssStyle = cssStyle + 'max-width: 90%;'
      $(images[j]).attr('style', cssStyle)
    }

    $rssEntry.toggleClass('hide', false);

    // Store the hash of the RSS entry into the DOM
    $rssEntry.attr('rss_hash', e.m_hash);
  }
}
FeedDisp.prototype.feedDisplay = feedDisplay;

// object FeedDisp.computePageRequest
// Advance by a page, -1, 0, 1
function computePageRequest(advance, dispContext)
{
  var self = this;
  utils_ns.assert(dispContext instanceof DispContext, "computePageRequest: x instanceof DispContext");

  var req = {};
  var tomorrow = null;
  if (advance == 0)  // Redisplay same page
  {
    if (dispContext.m_curPage == 0)  // Handle first page as a special case
    {
      dispContext.m_totalNumEntries = 0;  // In page 0 we count the total number of entries
      req.m_startDate = new Date();  // 1 day in the future to accomodate timezones
      tomorrow = req.m_startDate.getDate() + 1;
      req.m_startDate.setDate(tomorrow);
    }
    req.m_isDescending = true;
    req.m_num = dispContext.m_numToLoad;
  }
  else if (advance == -1)  // Older page
  {
    ++dispContext.m_curPage;
    req.m_startDate = dispContext.m_bottomTime;
    req.m_isDescending = true;  // DB read is descending from startDate
    req.m_num = dispContext.m_numToLoad;
  }
  else if (advance == 1)  // Newer page
  {
    utils_ns.assert(dispContext.m_curPage > 0, "computePageRequest: can't advance before page 0");
    --dispContext.m_curPage;
    if (dispContext.m_curPage == 0)  // Handle first page as a special case to display any freshly fetched
    {
      dispContext.m_totalNumEntries = 0;  // In page 0 we count the total number of entries
      req.m_startDate = new Date();  // 1 day in the future to accomodate timezones
      tomorrow = req.m_startDate.getDate() + 1;
      req.m_startDate.setDate(tomorrow);
      req.m_isDescending = true;  // Page 0 is always read in ascending order (we read the full list of items)
    }
    else
    {
      req.m_startDate = dispContext.m_topTime;
      req.m_isDescending = false;  // DB read is ascending from startDate
    }
    req.m_num = dispContext.m_numToLoad;
  }
  else
  {
    utils_ns.assert(false, "computePageRequest: wronge value for 'advance' =" + advance);
  }

  return req;
}
FeedDisp.prototype.computePageRequest = computePageRequest;

// export to feeds_ns namespace
feeds_ns.FeedDisp = FeedDisp;
})();
