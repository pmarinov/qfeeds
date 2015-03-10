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

// Object RssError.RssError [constructor]
function RssError(title, info)
{
  this.m_title = title;
  this.m_info = info;

  // Help strict mode detect misstyped fields
  Object.preventExtensions(this);

  return this;
}

var RssSyncState =
{
  IS_SYNCED: 0,
  IS_REMOTE_ONLY: 1,
  IS_LOCAL_ONLY: 2,
  IS_PENDING_SYNC: 3
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
  this.m_remote_state = RssSyncState.IS_LOCAL_ONLY;
  this.m_remote_id = '';  // This ID is created by remote table DB manager

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
  x.m_remote_state = from.m_remote_state;
  x.m_remote_id = from.m_remote_id;
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
  this.m_link = link;  // Link to web site or page that is behind the feed m_url
  this.m_description = description;
  this.m_language = language;
  this.m_date = updated;
  this.m_tags = '';  // list of comma separated tags
  this.m_is_unsubscribed = false;  // Mark for unsubsription (permits undo)
  this.m_rss_type = '';  // RSS or Atom
  this.m_rss_version = '';

  // meta (stored in db)
  this.m_hash = null;
  if (url != null)
  {
    var sha1 = CryptoJS.SHA1(url);
    this.m_hash = sha1.toString();
  }
  this.m_remote_state = RssSyncState.IS_LOCAL_ONLY;
  this.m_remote_id = '';  // This ID is created by remote table DB manager

  // meta (not stored in db)
  // x_items are extacted from database or fetched from the source web site
  // many times header is passed with no items altogether
  this.x_items = new Object; // hash table, item hash is the key
  this.x_pending_db = false; // _true_ when write operation starts, _false_ when completed
  this.x_errors = [];  // array of RssError objects

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
  x.m_remote_state = from.m_remote_state;

  x.x_pending_db = from.x_pending_db;
  if (from.x_errors === undefined)
    x.x_errors = [];
  else
    x.x_errors = from.x_errors;

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

  if (self.m_title == null && self.m_description == null &&
      self.m_link == null && self.m_date == null)
    return null;

  var component1 = self.m_title;
  if (component1.length == 0)
    component1 = self.m_description;

  var joined = [component1, self.m_link, utils_ns.dateToStrStrict(self.m_date)].join('');
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

  var errors = [];

  var channel = jQuery('channel', xmlStr).eq(0);
  if (channel.length == 0)
    errors.push('channel not found');
  var title = getField(channel, 'title:first', errors);
  // try jQuery(channel).find('link').eq(0).is('atom\\:link')
  var link = getField(channel, 'link:first', null);
  var href = getHrefField(channel, 'link', null);
  if (link.length == 0)
    link = href;
  var description = getField(channel, 'encoded', null);  // content:encoded
  if (description.length == 0)
    description = getField(channel, 'description:first', null);
  if (description.length == 0)
    description = getField(channel, 'description', null);
  var language = getField(channel, 'language:first', errors);
  var strTime = getField(channel, 'lastBuildDate:first', null);
  if (strTime.length == 0)
    strTime = getField(channel, 'pubDate:first', errors);
  var updated = utils_ns.parseDate(strTime);
  if (updated == null)
    errors.push('lastBuildDate bad');

  ret.feed =
    new RssHeader('', title, link, description, language, updated);

  var errorXML = channel.prop('outerHTML');
  ret.feed.x_errors.push(new RssError('error: ' + errors.join(', '), errorXML));

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
        errors.push('Needs "title" or "description"');

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

  var errors = [];

  var channel = jQuery('feed', xmlStr).eq(0);
  if (channel.length == 0)
    errors.push('feed not found');
  var title = getField(channel, 'title:first', errors);
  var link = getHrefField(channel, 'link:first', errors);
  var description = getField(channel, 'subtitle:first', errors);
  var language = getField(channel, 'xml:lang', null);
  var strTime = getField(channel, 'updated:first', errors);
  var updated = utils_ns.parseDate(strTime);
  if (updated == null)
    errors.push('lastBuildDate bad');

  ret.feed =
    new RssHeader('', title, link, description, language, updated);

  var errorXML = channel.prop('outerHTML');
  ret.feed.x_errors.push(new RssError('error: ' + errors.join(', '), errorXML));

  var errorsEntries = [];
  jQuery('entry', xmlStr).each(function()
    {
      var title = getItemField(this, 'title', errors);
      var link = getHrefItemField(this, 'link', errors);
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

//
// Parse RSS or Atom
function parse(feedUrl, xmlDoc)
{
  var ret =
  {
    feed: new RssHeader(feedUrl, null, null, null, null, null),
    errorMsg: null  // One global fatal error
  };

  var $feed = xmlDoc.children[0];  // There should be one top lebel tag '<rss> or <feed>'
  if ($feed.length == 0)
  {
    ret.errorMsg = 'not a valid RSS feed XML';
    return ret;
  }

  var version = '';
  var i = 0;
  var j = 0;
  var k = 0;
  var hasChannel = false;
  var $channel = [];
  var $entry = null;
  var $itemTags = [];
  var $tag = null;
  var tagContent = '';
  var header_title = '';
  var header_link = '';
  var header_description = '';
  var header_strTime = '';
  var header_updated = null;
  var item_title = '';
  var item_link = '';
  var item_href = '';
  var item_description = '';
  var item_strTime = '';
  var item_updated = null;
  var item_id = '';
  var errors = [];  // [] of RssError
  var errorXML = '';
  var item = null;
  var items = {};
  var typeStr = '';
  if ($feed.nodeName == 'rss')
  {
    // ====== RSS ======
    // $feed is <rss>...</rss>
    version = $feed.attributes['version'];

    // In practice there should be only one entry <channel>...</channel>
    for (i = 0; i < $feed.children.length; ++i)
    {
      if ($feed.children[i].tagName != 'channel')
      {
        errorXML = jQuery($feed.children[i]).prop('outerHTML').substr(0, 256);
        errors.push(new RssError('Unknown feed entry for channel ' +
                    $feed.children[i].tagName, errorXML));
        break;
      }

      hasChannel = true;
      $channel = $feed.children[i];
      // Inside <channel> we have things like <title>, <description> and a number of <items>
      for (j = 0; j < $channel.children.length; ++j)
      {
        $entry = $channel.children[j];

        if ($entry.tagName == 'item')
        {
          //
          // RSS Entry (inside tag <item>)
          // Each entry has <title>, <description>, etc.
          $itemTags = $entry.children;
          item_link = null;
          for (k = 0; k < $itemTags.length; ++k)
          {
            $tag = $itemTags[k];
            tagContent = jQuery($tag).text();

            if ($tag.tagName == 'title')
              item_title = tagContent;
            else if ($tag.tagName == 'link')
              item_link = tagContent;
            else if ($tag.tagName == 'href')
              item_href = tagContent;
            else if ($tag.tagName == 'description')
              item_description = tagContent;
            else if ($tag.tagName == 'pubDate')
              item_strTime = tagContent;
            else if ($tag.tagName == 'guid')
              item_id = tagContent;
          }

          item_updated = utils_ns.parseDate(item_strTime);

          if (item_title.length == 0 && item_description.length == 0)
          {
            errorXML = jQuery($entry).prop('outerHTML').substr(0, 256);
            errors.push(new RssError('Item needs "title" or "description"', errorXML));
          }

          if (item_updated == null)
          {
            errorXML = jQuery($entry).prop('outerHTML').substr(0, 256);
            errors.push(new RssError('"lastBuildDate" bad', errorXML));
          }

          if (item_link == null)
            item_link = item_href;

          item = new RssEntry(item_title, item_link, item_description, item_updated, item_id);
          items[item.m_hash] = item;
        }
        else
        {
          //
          // Header elements of the RSS feed
          tagContent = jQuery($entry).text();
          if ($entry.tagName == 'title')
            header_title = tagContent;
          else if ($entry.tagName == 'link')
            header_link = tagContent;
          else if ($entry.tagName == 'description')
            header_description = tagContent;
          else if ($entry.tagName == 'lastBuildDate')
            header_strTime = tagContent;
          else if ($entry.tagName == 'pubDate')
            header_strTime = tagContent;
        }
      }

      header_updated = utils_ns.parseDate(header_strTime);

      ret.feed =
        new RssHeader('', header_title, header_link, header_description, 'no language', header_updated);
      ret.feed.m_rss_version = version;
      ret.feed.m_rss_type = 'RSS';
      ret.feed.x_items = items;
      ret.feed.x_errors = errors;
    }

    if (!hasChannel)
    {
      errorXML = jQuery($feed).prop('outerHTML').substr(0, 512);
      ret.feed.x_errors.push(new RssError('Feed channel tag not found', errorXML));
    }
  }
  else if ($feed.nodeName == 'feed')
  {
    // ====== Atom ======
    // $feed is <feed>...</feed>

    // We have header tags (<title>, <sutbtitle>, etc.) and feed entries (one or more <entry> tags)
    for (j = 0; j < $feed.children.length; ++j)
    {
      $entry = $feed.children[j];

      if ($entry.tagName == 'entry')
      {
          //
          // Atom Entry (inside tag <entry>)
          // Each entry has <title>, <content>, etc.
          $itemTags = $entry.children;
          item_description = null;
          for (k = 0; k < $itemTags.length; ++k)
          {
            $tag = $itemTags[k];
            tagContent = jQuery($tag).text();

            if ($tag.tagName == 'title')
              item_title = tagContent;
            else if ($tag.tagName == 'link')
              item_link = jQuery($entry).attr('href');
            else if ($tag.tagName == 'content')
              item_description = tagContent;
            else if ($tag.tagName == 'summary')
              item_description = tagContent;
            else if ($tag.tagName == 'updated')
              item_strTime = tagContent;
            else if ($tag.tagName == 'id')
              item_id = tagContent;
          }

          item_updated = utils_ns.parseDate(item_strTime);

          if (item_title.length == 0 && item_description.length == 0)
          {
            errorXML = jQuery($entry).prop('outerHTML').substr(0, 256);
            errors.push(new RssError('Item needs "title" or "description"', errorXML));
          }

          if (item_updated == null)
          {
            errorXML = jQuery($entry).prop('outerHTML').substr(0, 256);
            errors.push(new RssError('"updated" bad', errorXML));
          }

          item = new RssEntry(item_title, item_link, item_description, item_updated, item_id);
          items[item.m_hash] = item;
      }
      else
      {
        //
        // Header elements of the Atom format feed
        tagContent = jQuery($entry).text();
        if ($entry.tagName == 'title')
          header_title = tagContent;
        else if ($entry.tagName == 'link')
        {
          typeStr = jQuery($entry).attr('type');
          if (typeStr == 'text/html')
            header_link = jQuery($entry).attr('href');
        }
        else if ($entry.tagName == 'subtitle')
          header_description = tagContent;
        else if ($entry.tagName == 'updated')
          header_strTime = tagContent;
      }
    }

    header_updated = utils_ns.parseDate(header_strTime);

    ret.feed =
      new RssHeader('', header_title, header_link, header_description, 'no language', header_updated);

    ret.feed.m_rss_version = '1.0';
    ret.feed.m_rss_type = 'Atom';
    ret.feed.x_items = items;
    ret.feed.x_errors = errors;
  }
  else
  {
    ret.errorMsg = 'not a valid RSS feed XML (2)';
  }

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
    timeout: 12 * 1000,
    dataType: "xml",
    error: function error(jqXHR, textStatus, errorThrown)
      {
        // Prapare the error message, will be reported by .fail()
        if (jqXHR.status == 404)
          errorMsg = '404, Network unreachable or resource not found';
        else
        {
          if (errorThrown != '')
            errorMsg = jqXHR.status + ', ' + errorThrown;
          else
            errorMsg = jqXHR.status;
        }
      }
    })
    .done(function (xmlStr)
    {
      //
      // Parse the header of the RSS feed

      parse(urlRss, xmlStr);

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
        var feed = emptyRssHeader();
        feed.m_url = urlRss;
        feed.m_title = urlRss;
        errorMsg = 'Unrecognized RSS feed type';
        cb(1, feed, new RssError('Content error', errorMsg));
      }
    })
    .fail(function ()
    {
      var feed = emptyRssHeader();
      feed.m_url = urlRss;
      feed.m_title = urlRss;
      feed.x_errors.push(new RssError('Error in the Internet:', errorMsg));
      cb(1, feed, errorMsg);
    });
}

// export to feeds_ns namespace
feeds_ns.RssError = RssError;
feeds_ns.RssSyncState = RssSyncState;
feeds_ns.RssEntry = RssEntry;
feeds_ns.emptyRssEntry = emptyRssEntry;
feeds_ns.copyRssEntry = copyRssEntry;
feeds_ns.RssHeader = RssHeader;
feeds_ns.emptyRssHeader = emptyRssHeader;
feeds_ns.copyRssHeader = copyRssHeader;
feeds_ns.fetchRss = fetchRss;

})();
