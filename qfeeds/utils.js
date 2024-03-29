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
"use strict";

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
  if (x == null)
    return 'date_is_null';

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
  if (x == null)
    return 'date_is_null';

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

// Parses string from dateToStrStrict()
// Ignores time portion
function parseStrictDateStr(strDate)
{
  var sdate = strDate;
  var y = parseInt(sdate.slice(0, 4));
  assert(!isNaN(y), 'Invalid date str: ' + strDate)
  var m = parseInt(sdate.slice(4, 6));
  assert(!isNaN(m), 'Invalid date str: ' + strDate)
  m -= 1;
  var d = parseInt(sdate.slice(6, 8));
  return new Date(y, m, d);
}

// Inserts space to indent a string
function indentedString(indent, str)
{
  var i = 0;
  var s = [];
  for (i = 0; i < indent; ++i)
    s.push(' ');
  s.push(str);
  return s.join('');
}

function domError(msg)
{
  log.error(msg);
  try
  {
    i.dont.exist += 0;
  }
  catch (e)  // Catch a simulated error just to obtain the stack
  {
    var e2 =
    {
      message: msg,
      stack: e.stack
    }
  }
  if (window.onerror != null)
  {
    log.error(e2.message);
    window.onerror(e2.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, e2);
  }
  else
    throw e;
}

// safe jQuery find under arbitrary DOM element
// tag: '.class', '#id', 'element'
function domFindInside(domRoot, tag, max)
{
  if (domRoot === undefined || domRoot == null)
  {
    domError("DOM: bad domRoot");
    return null;
  }

  if (typeof max === "undefined")
    max = 1;  // default max

  var z = $(domRoot).find(tag);

  // not found?
  if (z == null || z.length == 0)
  {
    domError("DOM: '" + tag + "' not found");
    return null;
  }

  // An array of elements of unkown count
  if (max == -1)
    return z;

  // more than needed?
  if (z.length > max)
  {
    domError("DOM: there should be only " + max + " of type '" + id + "'");
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

// Return a copy of all elements of the array
Array.prototype.copy = function()
{
  return this.slice();
}

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
    try
    {
      i.dont.exist += 0;
    }
    catch (e)  // Catch a simulated error just to obtain the stack
    {
      var e2 =
      {
        message: "ASSERT: " + message || "Assertion failed",
        stack: e.stack
      }
    }
    if (window.onerror != null)
      window.onerror(e2.message, 'chrome-extension:mumbojumbo/app.html', 0, 0, e2);
    else
      throw e;
  }
}

function hasFields(obj, arrayOfNames, message)
{
  var i = 0;
  var f = null;
  assert(obj != null, 'Bad object [null]; ' + message);
  assert(obj !== undefined, 'Bad object [undefined]; ' + message);
  for (i = 0; i < arrayOfNames.length; ++i)
  {
    if (obj[arrayOfNames[i]] === undefined)
      assert(false, 'missing field "' + arrayOfNames[i] + '"; ' + message);
  }
}

function roughSizeOfObject(object)
{
  var objectList = [];

  var recurse = function(value)
  {
    var bytes = 0;

    if (typeof value === 'boolean')
      bytes = 4;
    else if (typeof value === 'string')
      bytes = value.length * 2;
    else if (typeof value === 'number')
      bytes = 8;
    else if(typeof value === 'object' && objectList.indexOf( value ) === -1)
    {
      objectList[ objectList.length ] = value;

      let i = 0;
      for(i in value)
      {
                bytes+= 8; // an assumed existence overhead
                bytes+= recurse( value[i] )
      }
    }

    return bytes;
  }

  return recurse( object );
}

function numberWithCommas(x)
{
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function numberWith2Decimals(v)
{
  return parseFloat(Math.round(v * 100) / 100).toFixed(2)
}

function StateMachine()
{
  let self = this;

  self.m_states = {};
  self.m_curState = null;
  self.m_prevState = null;
  return this;
}

function add(name, stateCb)
{
  let self = this;

  self.m_states[name] = stateCb;
}
StateMachine.prototype.add = add;

function advance(toState)
{
  let self = this;

  let i = 0
  assert(self.m_states[toState] !== undefined,
      'Unknown state "' + toState + '"');
  self.m_prevState = self.m_curState;
  self.m_curState = toState;

  setTimeout(function ()
  {
      // log.info('state:  ' + self.m_curState);
      var step = self.m_states[self.m_curState];
      step();
  }, 0);  // Delay 0, just yield
}
StateMachine.prototype.advance = advance;

function stringify()
{
  let self = this;

  return self.m_curState + ' (prev=' + self.m_prevState + ')';
}
StateMachine.prototype.stringify = stringify;


function EventQ(handlerCb)
{
  let self = this;

  self.m_events = [];
  self.m_cur = null;  // No event in progress
  self.m_timeEv = new Date();  // Marks the time when m_cur was set
  self.m_handlerCb = handlerCb;

  // Help strict mode detect miss-typed fields
  Object.preventExtensions(this);

  return this;
}

function p_eventSchedule()
{
  let self = this;

  assert(self.m_cur != null, 'p_eventSchedule: no event to schedule');

  setTimeout(self.m_handlerCb, 0, self.m_cur);
}
EventQ.prototype.p_eventSchedule = p_eventSchedule;

function p_eventToStr()
{
  let self = this;

  let strEv = '';
  let strTable = '';
  if (self.m_cur.event !== undefined)
    strEv = self.m_cur.event;
  if (self.m_cur.tableName !== undefined)
    strTable = self.m_cur.tableName;

  return `(${strEv},${strTable})`;
}
EventQ.prototype.p_eventToStr = p_eventToStr;

function runEvent(event)
{
  let self = this;

  // If an event is in progress, add event to the queue
  if (self.m_cur != null)
  {
    console.log(self.m_cur);
    console.log(`EventQ.runEvent(${event.event}): Another event is in progress (listed above), adding to the queue`);
    self.m_events.push(event);
    let now = new Date();
    let elapsed_ms = now - self.m_timeEv;
    if (elapsed_ms > 1000 * 60)
      domError('runEvent(), took too long to handle: ' + self.p_eventToStr());
    return;
  };

  self.m_cur = event;
  self.m_timeEv = new Date();
  self.p_eventSchedule();
}
EventQ.prototype.runEvent = runEvent;

function eventDone()
{
  let self = this;

  assert(self.m_cur != null, 'eventDone(${self.m_cur.event}): no event in progress');

  if (!self.p_getNext())
    return;

  self.p_eventSchedule();
}
EventQ.prototype.eventDone = eventDone;

function addEvent(event)
{
  let self = this;

  self.m_events.push(event);
}
EventQ.prototype.addEvent = addEvent;

function p_getNext()
{
  let self = this;

  if (self.m_events.length == 0)
  {
    self.m_cur = null;
    return false;
  }

  self.m_cur = self.m_events[0];  // Grap from the head of the array
  self.m_events.splice(0, 1);  // Remove from position 0

  return true;
}
EventQ.prototype.p_getNext = p_getNext;

utils_ns.assert = assert;
utils_ns.roughSizeOfObject = roughSizeOfObject;
utils_ns.hasFields = hasFields;
utils_ns.parseDate = parseDate;
utils_ns.dateToStr = dateToStr;
utils_ns.dateToStrStrict = dateToStrStrict;
utils_ns.parseStrictDateStr = parseStrictDateStr;
utils_ns.indentedString = indentedString;
utils_ns.domError = domError;
utils_ns.domFindInside = domFindInside;
utils_ns.domFind = domFind;
utils_ns.clickIsInside = clickIsInside;
utils_ns.listOfFields = listOfFields;
utils_ns.copyFields = copyFields;
utils_ns.marshal = marshal;
utils_ns.numberWithCommas = numberWithCommas;
utils_ns.numberWith2Decimals = numberWith2Decimals;
utils_ns.StateMachine = StateMachine;
utils_ns.EventQ = EventQ;

})();
