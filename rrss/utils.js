// utils.js, -*- mode: javascript; -*-
//
// This software is distributed under the terms of the BSD License.
// Copyright (c) 2014, Peter Marinov and Contributors
// see LICENSE.txt, CONTRIBUTORS.txt

// Declare empty namespace if not yet defined
if (typeof utils_ns === 'undefined')
{
  utils_ns = {};
}

(function ()
{

// convert seconds since jan/1970 into Date/Time
function toDateTime(secs)
{
  var t = new Date(1970,0,1);
  t.setSeconds(secs);
  return t;
}

// convert string to date/time
function parseDate(s)
{
  var milliseconds = Date.parse(s);
  if (isNaN(milliseconds))
    return null;
  var d = toDateTime(milliseconds / 1000);
  return d;
}

function timeDigits(t)
{
  if (t < 10)
    return '0' + t.toString();
  else
    return t.toString();
}

function dateToStr(x)
{
  var x_date = x.getDate();
  var x_month = x.getMonth() + 1;  // Months are zero based
  var x_year = x.getFullYear();
  var x_hour = x.getHours();
  var x_min = x.getMinutes();
  var x_seconds = x.getSeconds();

  var d = x_year + '-' + timeDigits(x_month) + '-' + timeDigits(x_date) +
          ', ' +
          timeDigits(x_hour) + ':' + timeDigits(x_min) + ':' + timeDigits(x_seconds);

  return d;
}

// Strict renderng of Date object, can be used as DB key
function dateToStrStrict(x)
{
  var x_date = x.getDate();
  var x_month = x.getMonth() + 1;  // Months are zero based
  var x_year = x.getFullYear();
  var x_hour = x.getHours();
  var x_min = x.getMinutes();
  var x_seconds = x.getSeconds();

  var d = x_year + timeDigits(x_month) + timeDigits(x_date) +
          '_' +
          timeDigits(x_hour) + timeDigits(x_min) + timeDigits(x_seconds);

  return d;
}

// safe jQuery find under arbitrary DOM element
// tag: '.class', '#id', 'element'
function domFindInside(domRoot, tag, max)
{
  if (domRoot === undefined || domRoot == null)
  {
    alert("DOM: bad domRoot");
    return null;
  }

  if (typeof max === "undefined")
    max = 1;  // default max

  var z = $(domRoot).find(tag);

  // not found?
  if (z == null || z.length == 0)
  {
    alert("DOM: '" + tag + "' not found");
    return null;
  }

  // An array of elements of unkown count
  if (max == -1)
    return z;

  // more than needed?
  if (z.length > max)
  {
    alert("DOM: there should be only " + max + " of type '" + id + "'");
    return null;
  }

  return z;  // or the entire array
}

// safe jQuery find under 'body' element
function domFind(tag, max)
{
  if(typeof max === "undefined")
    max = 1;
  return domFindInside($('body')[0], tag, max);
}

// Finds if point x,y falls inside the DOM element d on the screen
function clickIsInside(d, x, y)
{
  var o = $(d).offset();
  var x1 = o.left;
  var y1 = o.top;
  var x2 = o.left + $(d).width();
  var y2 = o.top + $(d).height();

  if (x >= x1 && x <= x2 && y >= y1 && y <= y2)
    return true;
  else
    return false;
}


// Finds the closest index where value >= the given value
Array.prototype.binarySearch = function(find, comparator)
{
  var low = 0;
  var high = this.length - 1;
  var mid = 0;
  var comparison = 0;
  while (low <= high)
  {
    mid = Math.floor((low + high) / 2);
    comparison = comparator(this[mid], find);
    if (comparison < 0)
    {
      low = mid + 1;
      continue;
    };
    if (comparison > 0)
    {
      high = mid - 1;
      continue;
    };
    return mid;
  }
  // no match found
  return -(low + 1);
};

// Find list of that start with _prefix_
function listOfFields(obj, prefix)
{
  var i = 0;
  var f = '';
  var p = '';
  var fields = Object.keys(obj);
  var mfields = [];
  for (i = 0; i < fields.length; ++i)
  {
    var f = fields[i];

    var p = fields[i].substr(0, prefix.length);
    if (p != prefix)
    {
      console.log('skip: ' + f);
      continue;
    }
    //console.log(f);
    mfields.push(f);
  }

  return mfields;
}

// Create a copy of an object _src_ by skipping the fields in skip[]
function copyFields(src, skip)
{
  var i = 0;
  var k = 0;
  var dest = new Object();
  var fields = Object.keys(src);
  var f = '';
  for (i = 0; i < fields.length; ++i)
  {
    f = fields[i];
    shouldSkip = false;
    for (k = 0; k < skip.length; ++k)
    {
      if (skip[k] == f)
      {
        shouldSkip = true;
        break;
      }
    }
    if (!shouldSkip)
      dest[f] = src[f];
  }

  return dest;
}

// marshal all fields of v into a temp object
// move only values of fields starting with prefix
// NOTE: the temp object's fields are references not
// copies of the original obj fields
function marshal(obj, prefix)
{
  var n = new Object();
  var i = 0;
  var fields = Object.keys(obj);
  var f = '';
  var v = null;
  var p = '';
  var d = '';
  for (i = 0; i < fields.length; ++i)
  {
    f = fields[i];
    v = obj[f];

    p = fields[i].substr(0, prefix.length);
    if (p != prefix)
    {
      //console.log('skip: ' + f + ":" + v);
      continue;
    }
    n[f] = v;

    d = ': ' + v;
    d = d.substring(0, 96);
    if (v != null && v.length > 95)
      d = d + '...';
    //console.log(f + d);
  }
  return n; 
}

function assert(must_be_true, message)
{
  if (!must_be_true)
  {
    throw "ASSERT: " + message || "Assertion failed";
  }
}

function hasFields(obj, arrayOfNames, message)
{
  var i = 0;
  var f = null;
  for (i = 0; i < arrayOfNames.length; ++i)
  {
    if (obj[arrayOfNames[i]] === undefined)
      assert(false, 'missing field "' + arrayOfNames[i] + '"; ' + message);
  }
}

utils_ns.assert = assert;
utils_ns.hasFields = hasFields;
utils_ns.parseDate = parseDate;
utils_ns.dateToStr = dateToStr;
utils_ns.dateToStrStrict = dateToStrStrict;
utils_ns.domFindInside = domFindInside;
utils_ns.domFind = domFind;
utils_ns.clickIsInside = clickIsInside;
utils_ns.listOfFields = listOfFields;
utils_ns.copyFields = copyFields;
utils_ns.marshal = marshal;


})();
