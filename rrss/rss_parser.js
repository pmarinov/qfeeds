// rss_parser.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

// Declare empty namespace if not yet defined
if (typeof feeds_ns === 'undefined')
{
  feeds_ns = {};
}

//
// RSS data definitions and manipulation primitives
//
// Documentation:
// http://cyber.law.harvard.edu/rss/rss.html
//

(function ()
{
"use strict";

var RssSyncState =
{
  IS_SYNCED: 0,
  IS_REMOTE_ONLY: 1,
  IS_LOCAL_ONLY: 2
}

// object RssEntry [constructor]
function RssEntry(title, link, description, updated, id)
{
  this.m_title = title;
  this.m_link = link;
  this.m_description = description;
  this.m_date = updated;
  this.m_id = id;

  // meta (stored in db)
  // m_hash: key in database
  this.m_hash = this.p_calcHash();
  // m_rssurl_date: compounded index in database = hash or RSSHeader url + m_date
  this.m_rssurl_date = '';  // computed before recorded in database
  this.m_is_read = false;
  this.m_dropbox_state = RssSyncState.IS_LOCAL_ONLY;

  // meta (stored in db)
  this.x_header = null; // back-ref to header
  return this;
}

// Object RssEntry.emptyRssEntry [factory]
function emptyRssEntry()
{
  return new RssEntry(null, null, null, null, null);
}

// object RssEntry.copyRssEntry [constructor]
function copyRssEntry(from)
{
  var x = new RssEntry(from.m_title, from.m_link, from.m_description, new Date(from.m_date), from.m_id);
  x.m_hash = from.m_hash;
  x.m_rssurl_date = from.m_rssurl_date;
  x.m_is_read = from.m_is_read;
  x.m_dropbox_state = from.m_dropbox_state;
  return x;
}

// object RssHeader [constructor]
function RssHeader(url, title, link, description, language, updated)
{
  // IMPORTANT: fields added here also need to be replicated in:
  // RssHeader.copyRssHeader
  // Feeds.p_feedUpdateHeader
  // Feeds.p_feedRecord
  this.m_url = url;
  this.m_title = title;
  this.m_link = link;
  this.m_description = description;
  this.m_language = language;
  this.m_date = updated;
  this.m_tags = '';  // list of comma separated tags
  this.m_is_unsubscribed = false;  // Mark for unsubsription (permits undo)
  this.m_rss_type = '';  // RSS or Atom
  this.m_rss_version = '';

  // meta (stored in db)
  var sha1 = CryptoJS.SHA1(url);
  this.m_hash = sha1.toString();

  // meta (not stored in db)
  // x_items are extacted from database or fetched from the source web site
  // many times header is passed with no items altogether
  this.x_items = new Object; // hash table, item hash is the key

  return this;
}

// object RssHeader.emptyRssHeader [factory]
function emptyRssHeader()
{
  return new RssHeader(null /*url*/, null /*title*/,
                       null /*link*/, null /*description*/, null /*language*/,
                       null /*updated*/);
}

// object RssHeader.copyRssHeader [constructor]
function copyRssHeader(from)
{
  var x = new RssHeader(from.m_url, from.m_title, from.m_link, from.m_description,
                    from.m_language, new Date(from.m_date));
  x.m_tags = from.m_tags;
  x.m_is_unsubscribed = from.m_is_unsubscribed;
  x.m_rss_type = from.m_rss_type;
  x.m_rss_version = from.m_rss_version;

  return x;
}

// object RssEntry.p_calcHash
//
// Hash identifies an item uniquely, all components of the hash need
// to be constant
//
// Formula 1: (m_title + m_description + m_link + m_date). But it turns
// out that m_description is not constant, many feeds put ads that
// change every time the feed is fetched
//
// Formula 2: (m_title + m_link + m_date). But some feeds might have
// no title, if so then use m_description instead.
function p_calcHash()
{
  var self = this;

  var component1 = self.m_title;
  if (component1.length == 0)
    component1 = self.m_description;

  var joined = [component1, self.m_link, utils_ns.dateToStr(self.m_date)].join('');
  var sha1 = CryptoJS.SHA1(joined);

  return sha1.toString();
}
RssEntry.prototype.p_calcHash = p_calcHash;

// Extracts an RSS header field
function getField(channel, fieldName, errors)
{
  var field = jQuery(channel).find(fieldName).text();
  var bad = false;
  if (field === undefined)
    bad = true;
  else
    if (field.length == 0)
      bad = true;
  if (bad && errors != null)
    errors.push(fieldName + ' not found');

  return field;
}

// Extracts an RSS item field
function getItemField(xmlItem, fieldName, errors)
{
  var field = jQuery(xmlItem).find(fieldName).eq(0).text();
  var bad = false;
  if (field === undefined)
    bad = true;
  else
    if (field.length == 0)
      bad = true;
  if (bad && errors != null)
    errors.push(fieldName + ' not found');

  return field;
}

// Extracts an Atom href field
function getHrefField(channel, fieldName, errors)
{
  var field = jQuery(channel).find(fieldName).attr('href');
  var bad = false;
  if (field === undefined)
    bad = true;
  else
    if (field.length == 0)
      bad = true;
  if (bad && errors != null)
    errors.push(fieldName + ' not found');

  return field;
}

// Extracts an Atom href item field
function getHrefItemField(xmlItem, fieldName, errors)
{
  var field = jQuery(xmlItem).find(fieldName).eq(0).attr('href');
  var bad = false;
  if (field === undefined)
    bad = true;
  else
    if (field.length == 0)
      bad = true;
  if (bad && errors != null)
    errors.push(fieldName + ' not found');

  return field;
}

// Parse RSS version 1.0 and 2.0
function parseRss10(xmlStr)
{
  var ret =
  {
    feed: emptyRssHeader(),
    errorMsg: null
  };

  var errorsHeader = [];

  var channel = jQuery('channel', xmlStr).eq(0);
  if (channel.length == 0)
    errorsHeader.push('channel not found');
  var title = getField(channel, 'title:first', errorsHeader);
  // try jQuery(channel).find('link').eq(0).is('atom\\:link')
  var link = getField(channel, 'link:first', null);
  var href = getHrefField(channel, 'link', null);
  if (link.length == 0)
    link = href;
  var description = getField(channel, 'description:first', errorsHeader);
  var language = getField(channel, 'language:first', errorsHeader);
  var strTime = getField(channel, 'lastBuildDate:first', null);
  if (strTime.length == 0)
    strTime = getField(channel, 'pubDate:first', errorsHeader);
  var updated = utils_ns.parseDate(strTime);
  if (updated == null)
    errorsHeader.push('lastBuildDate bad');

  if (errorsHeader.length != 0)
  {
    ret.errorMsg = 'rss parse error: header: ' + errorsHeader.join(', ');
    return ret;
  }

  ret.feed =
    new RssHeader('', title, link, description, language, updated);

  // The RSS 2.0 standard, see "Elements of <item>"
  //
  // An item may represent a "story" -- much like a story in a
  // newspaper or magazine; if so its description is a synopsis of the
  // story, and the link points to the full story. An item may also be
  // complete in itself, if so, the description contains the text
  // (entity-encoded HTML is allowed; see examples), and the link and
  // title may be omitted. All elements of an item are optional,
  // however at least one of title or description must be present.

  var errorsEntries = [];
  jQuery('item', xmlStr).each(function()
    {
      var title = getItemField(this, 'title', null);
      var link = getItemField(this, 'link', null);
      var href = getHrefItemField(channel, 'link', null);  // 2.0 style link
      if (link.length == 0)
        link = href;
      var description = getItemField(this, 'description', errorsEntries);

      if (title.length == 0 && description.length == 0)
        errorsHeader.push('Needs "title" or "description"');

      var strTimeEntry = getItemField(this, 'pubDate', errorsEntries);
      var updated = utils_ns.parseDate(strTimeEntry);
      if (updated == null)
        errorsEntries.push('lastBuildDate bad');
      var id = getItemField(this, 'guid', errorsEntries);
      var item = new RssEntry(title, link, description, updated, id);

      ret.feed.x_items[item.m_hash] = item;
    });

  if (errorsEntries.length != 0)
    ret.errorMsg = 'rss parse error: item: ' + errorsEntries.join(', ');

  return ret;
}

// Parse Atom 1.0
function parseAtom(xmlStr)
{
  var ret =
  {
    feed: emptyRssHeader(),
    errorMsg: null
  };

  var errorsHeader = [];

  var channel = jQuery('feed', xmlStr).eq(0);
  if (channel.length == 0)
    errorsHeader.push('feed not found');
  var title = getField(channel, 'title:first', errorsHeader);
  var link = getHrefField(channel, 'link:first', errorsHeader);
  var description = getField(channel, 'subtitle:first', errorsHeader);
  var language = getField(channel, 'xml:lang', null);
  var strTime = getField(channel, 'updated:first', errorsHeader);
  var updated = utils_ns.parseDate(strTime);
  if (updated == null)
    errorsHeader.push('lastBuildDate bad');

  if (errorsHeader.length != 0)
  {
    ret.errorMsg = 'rss parse error: header: ' + errorsHeader.join(', ');
    return ret;
  }

  ret.feed =
    new RssHeader('', title, link, description, language, updated);

  var errorsEntries = [];
  jQuery('entry', xmlStr).each(function()
    {
      var title = getItemField(this, 'title', errorsHeader);
      var link = getHrefItemField(this, 'link', errorsHeader);
      var description = getItemField(this, 'content', null);
      var summary = getItemField(this, 'summary', null);
      if (description.length == 0)
        description = summary;
      var strTimeEntry = getItemField(this, 'updated', errorsEntries);
      var updated = utils_ns.parseDate(strTimeEntry);
      if (updated == null)
        errorsEntries.push('lastBuildDate bad');
      var id = getItemField(this, 'id', errorsEntries);
      var item = new RssEntry(title, link, description, updated, id);

      ret.feed.x_items[item.m_hash] = item;
    });

  if (errorsEntries.length != 0)
    ret.errorMsg = 'rss parse error: item: ' + errorsEntries.join(', ');

  return ret;
}

// function fetchRss
// HTTP GET of RSS url, parse it and invoke callback with ready RssHeader an error
function fetchRss(urlRss, cb)
{
  var errorMsg = '';

  $.ajax({
    type: "GET",
    url: urlRss,
    dataType: "xml",
    error: function error(jqXHR, textStatus, errorThrown)
      {
        // Prapare the error message, will be reported by .fail()
        errorMsg = 'error: ' + jqXHR.status + ', ' + errorThrown;
      }
    })
    .done(function (xmlStr)
    {
      //
      // Parse the header of the RSS feed

      if (jQuery('channel', xmlStr).length == 1)
      {
        var version = "";
        if (jQuery('rss', xmlStr).length == 0)
          version = '1.0';
        else
          version = jQuery('rss', xmlStr).eq(0).attr('version');

        var r = parseRss10(xmlStr);
        r.feed.m_url = urlRss;
        r.feed.m_rss_type = 'RSS';
        r.feed.m_rss_version = version;

        if (r.errorMsg != null)
          cb(1, r.feed, r.errorMsg);
        else
          cb(0, r.feed, null);
      }
      else if (jQuery('feed', xmlStr).length == 1)
      {
        var a = parseAtom(xmlStr);
        a.feed.m_url = urlRss;
        a.feed.m_rss_type = 'Atom';
        a.feed.m_rss_version = '1.0';

        if (a.errorMsg != null)
          cb(1, a.feed, a.errorMsg);
        else
          cb(0, a.feed, null);
      }
      else
      {
        var x = emptyRssHeader();
        x.m_url = urlRss;
        cb(1, x, 'Unknown RSS feed type');
      }
    })
    .fail(function ()
    {
      var feed = emptyRssHeader();
      feed.m_url = urlRss;
      cb(1, feed, errorMsg);
    });
}

// export to feeds_ns namespace
feeds_ns.RssSyncState = RssSyncState;
feeds_ns.RssEntry = RssEntry;
feeds_ns.emptyRssEntry = emptyRssEntry;
feeds_ns.copyRssEntry = copyRssEntry;
feeds_ns.RssHeader = RssHeader;
feeds_ns.emptyRssHeader = emptyRssHeader;
feeds_ns.copyRssHeader = copyRssHeader;
feeds_ns.fetchRss = fetchRss;

})();
