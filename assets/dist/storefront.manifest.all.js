(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.index = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var EntityClient = require('mozu-node-sdk/clients/platform/entitylists/entity');
var CustomerAccountClient = require('mozu-node-sdk/clients/commerce/customer/customerAccount');

var getAppInfo = require('mozu-action-helpers/get-app-info');
var TokenFactory = require('./TokenFactory');
var CryptoHelper = require('./CryptoHelper');

function ClientService(context) {
    var appInfo = getAppInfo(context);
    this._context = context;
    this._entityListName = 'sales_reps@' + appInfo.namespace;
     this._westHost = (context.configuration || {}).westHost;
                this._eastHost = (context.configuration || {}).westHost;
}

ClientService.prototype.getList = function(request) {
    var me = this;
    var user = me._context.items.pageContext.user;
    var pageSize = (request || {}).pageSize || 30;
    var page = ((request || {}).page || 1) - 1;
    var offset = pageSize * page;

    var ret = {
        total: 0,
        clients: []
    };

    if (!user || user.isAnonymous || !user.email) {
        return new Promise(function(resolve) {
            resolve(ret);
        });
    }
    var tokenFactory = TokenFactory.create(me._context);
    var cryptoHelper = CryptoHelper.create(me._context);
    var lcEmail = user.email.toLowerCase();
    var entityClient = new EntityClient({
        context: me._context.apiContext
    });

    return entityClient.getEntity({
        id: lcEmail,
        entityListFullName: me._entityListName
    }).then(function(res) {
        if (res.clients) {
            ret.total = res.clients.length;
            ret.clients = res.clients.slice(offset, offset + pageSize).map(function(customer) {
                var password = cryptoHelper.decrypt(customer.password);
                customer.token = tokenFactory.createToken(customer.email, password);
                customer.host = 'https://' + customer.segment === 'east' ? me._eastHost : me._westHost;
                return customer;
            });
        }
        return ret;
    });
};


module.exports = ClientService;

},{"./CryptoHelper":2,"./TokenFactory":3,"mozu-action-helpers/get-app-info":16,"mozu-node-sdk/clients/commerce/customer/customerAccount":20,"mozu-node-sdk/clients/platform/entitylists/entity":21}],2:[function(require,module,exports){
var cryptLib = require('cryptlib');
function CryptoHelper(context) {
    this.key = cryptLib.getHashSha256((context.configuration || {}).cryptPhrase || 'password', 16);
    this.iv = (context.configuration || {}).cryptIv || '2fBrYTgZIzGjc_FI';
}
CryptoHelper.prototype.encrypt = function(input) {
    return cryptLib.encrypt(input, this.key, this.iv);
};
CryptoHelper.prototype.decrypt = function(input) {
    return cryptLib.decrypt(input, this.key, this.iv);
};

module.exports = {
    create: function(context) {
        return new CryptoHelper(context);
    }
};

},{"cryptlib":12}],3:[function(require,module,exports){
var CryptoHelper = require('./CryptoHelper');
function TokenFactory(context) {
    this.cryptoHelper = CryptoHelper.create(context);
}
TokenFactory.prototype.createToken = function(username, password) {
    var plainTextToken = JSON.stringify({
        username: username,
        password: password,
        date: new Date().getTime()
    });
    return this.cryptoHelper.encrypt(plainTextToken);
};
TokenFactory.prototype.decryptTicket = function(token) {
    var raw = this.cryptoHelper.decrypt(token);
    var jToken = JSON.parse(raw);
    var minutesOld = (new Date().getTime() - jToken.date) / (1000 * 60);
    if (minutesOld > 5) {
        throw new Error('token expired.  [' + minutesOld + 'minutes old');
    }
    return jToken;
};
module.exports = {
    create: function(context) {
        return new TokenFactory(context);
    }
};

},{"./CryptoHelper":2}],4:[function(require,module,exports){
var ClientService = require('../ClientService');

module.exports = function(context, callback) {
    var clientService = new ClientService(context);

    clientService.getList().then(function(res) {
        context.response.body = res;
        callback();
    }).catch(callback);
};

},{"../ClientService":1}],5:[function(require,module,exports){
module.exports = {
  
  'http.storefront.routes': {
      actionName: 'http.storefront.routes',
      customFunction: require('./domains/storefront/http.storefront.routes')
  }
};

},{"./domains/storefront/http.storefront.routes":4}],6:[function(require,module,exports){
(function (Buffer){
var DuplexStream = require('readable-stream/duplex')
  , util         = require('util')

function BufferList (callback) {
  if (!(this instanceof BufferList))
    return new BufferList(callback)

  this._bufs  = []
  this.length = 0

  if (typeof callback == 'function') {
    this._callback = callback

    var piper = function (err) {
      if (this._callback) {
        this._callback(err)
        this._callback = null
      }
    }.bind(this)

    this.on('pipe', function (src) {
      src.on('error', piper)
    })
    this.on('unpipe', function (src) {
      src.removeListener('error', piper)
    })
  }
  else if (Buffer.isBuffer(callback))
    this.append(callback)
  else if (Array.isArray(callback)) {
    callback.forEach(function (b) {
      Buffer.isBuffer(b) && this.append(b)
    }.bind(this))
  }

  DuplexStream.call(this)
}

util.inherits(BufferList, DuplexStream)

BufferList.prototype._offset = function (offset) {
  var tot = 0, i = 0, _t
  for (; i < this._bufs.length; i++) {
    _t = tot + this._bufs[i].length
    if (offset < _t)
      return [ i, offset - tot ]
    tot = _t
  }
}

BufferList.prototype.append = function (buf) {
  var isBuffer = Buffer.isBuffer(buf) ||
                 buf instanceof BufferList

  this._bufs.push(isBuffer ? buf : new Buffer(buf))
  this.length += buf.length
  return this
}

BufferList.prototype._write = function (buf, encoding, callback) {
  this.append(buf)
  if (callback)
    callback()
}

BufferList.prototype._read = function (size) {
  if (!this.length)
    return this.push(null)
  size = Math.min(size, this.length)
  this.push(this.slice(0, size))
  this.consume(size)
}

BufferList.prototype.end = function (chunk) {
  DuplexStream.prototype.end.call(this, chunk)

  if (this._callback) {
    this._callback(null, this.slice())
    this._callback = null
  }
}

BufferList.prototype.get = function (index) {
  return this.slice(index, index + 1)[0]
}

BufferList.prototype.slice = function (start, end) {
  return this.copy(null, 0, start, end)
}

BufferList.prototype.copy = function (dst, dstStart, srcStart, srcEnd) {
  if (typeof srcStart != 'number' || srcStart < 0)
    srcStart = 0
  if (typeof srcEnd != 'number' || srcEnd > this.length)
    srcEnd = this.length
  if (srcStart >= this.length)
    return dst || new Buffer(0)
  if (srcEnd <= 0)
    return dst || new Buffer(0)

  var copy   = !!dst
    , off    = this._offset(srcStart)
    , len    = srcEnd - srcStart
    , bytes  = len
    , bufoff = (copy && dstStart) || 0
    , start  = off[1]
    , l
    , i

  // copy/slice everything
  if (srcStart === 0 && srcEnd == this.length) {
    if (!copy) // slice, just return a full concat
      return Buffer.concat(this._bufs)

    // copy, need to copy individual buffers
    for (i = 0; i < this._bufs.length; i++) {
      this._bufs[i].copy(dst, bufoff)
      bufoff += this._bufs[i].length
    }

    return dst
  }

  // easy, cheap case where it's a subset of one of the buffers
  if (bytes <= this._bufs[off[0]].length - start) {
    return copy
      ? this._bufs[off[0]].copy(dst, dstStart, start, start + bytes)
      : this._bufs[off[0]].slice(start, start + bytes)
  }

  if (!copy) // a slice, we need something to copy in to
    dst = new Buffer(len)

  for (i = off[0]; i < this._bufs.length; i++) {
    l = this._bufs[i].length - start

    if (bytes > l) {
      this._bufs[i].copy(dst, bufoff, start)
    } else {
      this._bufs[i].copy(dst, bufoff, start, start + bytes)
      break
    }

    bufoff += l
    bytes -= l

    if (start)
      start = 0
  }

  return dst
}

BufferList.prototype.toString = function (encoding, start, end) {
  return this.slice(start, end).toString(encoding)
}

BufferList.prototype.consume = function (bytes) {
  while (this._bufs.length) {
    if (bytes > this._bufs[0].length) {
      bytes -= this._bufs[0].length
      this.length -= this._bufs[0].length
      this._bufs.shift()
    } else {
      this._bufs[0] = this._bufs[0].slice(bytes)
      this.length -= bytes
      break
    }
  }
  return this
}

BufferList.prototype.duplicate = function () {
  var i = 0
    , copy = new BufferList()

  for (; i < this._bufs.length; i++)
    copy.append(this._bufs[i])

  return copy
}

BufferList.prototype.destroy = function () {
  this._bufs.length = 0;
  this.length = 0;
  this.push(null);
}

;(function () {
  var methods = {
      'readDoubleBE' : 8
    , 'readDoubleLE' : 8
    , 'readFloatBE'  : 4
    , 'readFloatLE'  : 4
    , 'readInt32BE'  : 4
    , 'readInt32LE'  : 4
    , 'readUInt32BE' : 4
    , 'readUInt32LE' : 4
    , 'readInt16BE'  : 2
    , 'readInt16LE'  : 2
    , 'readUInt16BE' : 2
    , 'readUInt16LE' : 2
    , 'readInt8'     : 1
    , 'readUInt8'    : 1
  }

  for (var m in methods) {
    (function (m) {
      BufferList.prototype[m] = function (offset) {
        return this.slice(offset, offset + methods[m])[m](0)
      }
    }(m))
  }
}())

module.exports = BufferList

}).call(this,require("buffer").Buffer)
},{"buffer":undefined,"readable-stream/duplex":7,"util":undefined}],7:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":8}],8:[function(require,module,exports){
// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

'use strict';

/*<replacement>*/

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    keys.push(key);
  }return keys;
};
/*</replacement>*/

module.exports = Duplex;

/*<replacement>*/
var processNextTick = require('process-nextick-args');
/*</replacement>*/

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

var keys = objectKeys(Writable.prototype);
for (var v = 0; v < keys.length; v++) {
  var method = keys[v];
  if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
}

function Duplex(options) {
  if (!(this instanceof Duplex)) return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false) this.readable = false;

  if (options && options.writable === false) this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended) return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  processNextTick(onEndNT, this);
}

function onEndNT(self) {
  self.end();
}

function forEach(xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}
},{"./_stream_readable":9,"./_stream_writable":10,"core-util-is":11,"inherits":13,"process-nextick-args":48}],9:[function(require,module,exports){
(function (process){
'use strict';

module.exports = Readable;

/*<replacement>*/
var processNextTick = require('process-nextick-args');
/*</replacement>*/

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events');

/*<replacement>*/
var EElistenerCount = function (emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

/*<replacement>*/
var Stream;
(function () {
  try {
    Stream = require('st' + 'ream');
  } catch (_) {} finally {
    if (!Stream) Stream = require('events').EventEmitter;
  }
})();
/*</replacement>*/

var Buffer = require('buffer').Buffer;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var debugUtil = require('util');
var debug = undefined;
if (debugUtil && debugUtil.debuglog) {
  debug = debugUtil.debuglog('stream');
} else {
  debug = function () {};
}
/*</replacement>*/

var StringDecoder;

util.inherits(Readable, Stream);

var Duplex;
function ReadableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.readableObjectMode;

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = null;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;
  this.resumeScheduled = false;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

var Duplex;
function Readable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  if (!(this instanceof Readable)) return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  if (options && typeof options.read === 'function') this._read = options.read;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function (chunk, encoding) {
  var state = this._readableState;

  if (!state.objectMode && typeof chunk === 'string') {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function (chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

Readable.prototype.isPaused = function () {
  return this._readableState.flowing === false;
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null) {
    state.reading = false;
    onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      var skipAdd;
      if (state.decoder && !addToFront && !encoding) {
        chunk = state.decoder.write(chunk);
        skipAdd = !state.objectMode && chunk.length === 0;
      }

      if (!addToFront) state.reading = false;

      // Don't add to the buffer if we've decoded to an empty string chunk and
      // we're not in object mode
      if (!skipAdd) {
        // if we want the data now, just emit it.
        if (state.flowing && state.length === 0 && !state.sync) {
          stream.emit('data', chunk);
          stream.read(0);
        } else {
          // update the buffer info.
          state.length += state.objectMode ? 1 : chunk.length;
          if (addToFront) state.buffer.unshift(chunk);else state.buffer.push(chunk);

          if (state.needReadable) emitReadable(stream);
        }
      }

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}

// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function (enc) {
  if (!StringDecoder) StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
  return this;
};

// Don't raise the hwm > 8MB
var MAX_HWM = 0x800000;
function computeNewHighWaterMark(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended) return 0;

  if (state.objectMode) return n === 0 ? 0 : 1;

  if (n === null || isNaN(n)) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length) return state.buffer[0].length;else return state.length;
  }

  if (n <= 0) return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else {
      return state.length;
    }
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function (n) {
  debug('read', n);
  var state = this._readableState;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0) state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
    debug('read: emitReadable', state.length, state.ended);
    if (state.length === 0 && state.ended) endReadable(this);else emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0) endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;
  debug('need readable', doRead);

  // if we currently have less than the highWaterMark, then also read some
  if (state.length === 0 || state.length - n < state.highWaterMark) {
    doRead = true;
    debug('length less than watermark', doRead);
  }

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading) {
    doRead = false;
    debug('reading or ended', doRead);
  }

  if (doRead) {
    debug('do read');
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0) state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read pushed data synchronously, then `reading` will be false,
  // and we need to re-evaluate how much data we can return to the user.
  if (doRead && !state.reading) n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0) ret = fromList(n, state);else ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended) state.needReadable = true;

  // If we tried to read() past the EOF, then emit end on the next tick.
  if (nOrig !== n && state.ended && state.length === 0) endReadable(this);

  if (ret !== null) this.emit('data', ret);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== null && chunk !== undefined && !state.objectMode) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}

function onEofChunk(stream, state) {
  if (state.ended) return;
  if (state.decoder) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // emit 'readable' now to make sure it gets picked up.
  emitReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (!state.emittedReadable) {
    debug('emitReadable', state.flowing);
    state.emittedReadable = true;
    if (state.sync) processNextTick(emitReadable_, stream);else emitReadable_(stream);
  }
}

function emitReadable_(stream) {
  debug('emit readable');
  stream.emit('readable');
  flow(stream);
}

// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    processNextTick(maybeReadMore_, stream, state);
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
    debug('maybeReadMore read 0');
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;else len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function (n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function (dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;
  debug('pipe count=%d opts=%j', state.pipesCount, pipeOpts);

  var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted) processNextTick(endFn);else src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    debug('onunpipe');
    if (readable === src) {
      cleanup();
    }
  }

  function onend() {
    debug('onend');
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  var cleanedUp = false;
  function cleanup() {
    debug('cleanup');
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);
    src.removeListener('data', ondata);

    cleanedUp = true;

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
  }

  src.on('data', ondata);
  function ondata(chunk) {
    debug('ondata');
    var ret = dest.write(chunk);
    if (false === ret) {
      // If the user unpiped during `dest.write()`, it is possible
      // to get stuck in a permanently paused state if that write
      // also returned false.
      if (state.pipesCount === 1 && state.pipes[0] === dest && src.listenerCount('data') === 1 && !cleanedUp) {
        debug('false write response, pause', src._readableState.awaitDrain);
        src._readableState.awaitDrain++;
      }
      src.pause();
    }
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    debug('onerror', er);
    unpipe();
    dest.removeListener('error', onerror);
    if (EElistenerCount(dest, 'error') === 0) dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error) dest.on('error', onerror);else if (isArray(dest._events.error)) dest._events.error.unshift(onerror);else dest._events.error = [onerror, dest._events.error];

  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    debug('onfinish');
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    debug('unpipe');
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    debug('pipe resume');
    src.resume();
  }

  return dest;
};

function pipeOnDrain(src) {
  return function () {
    var state = src._readableState;
    debug('pipeOnDrain', state.awaitDrain);
    if (state.awaitDrain) state.awaitDrain--;
    if (state.awaitDrain === 0 && EElistenerCount(src, 'data')) {
      state.flowing = true;
      flow(src);
    }
  };
}

Readable.prototype.unpipe = function (dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0) return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes) return this;

    if (!dest) dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;
    if (dest) dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    state.flowing = false;

    for (var _i = 0; _i < len; _i++) {
      dests[_i].emit('unpipe', this);
    }return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1) return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1) state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function (ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  // If listening to data, and it has not explicitly been paused,
  // then call resume to start the flow of data on the next tick.
  if (ev === 'data' && false !== this._readableState.flowing) {
    this.resume();
  }

  if (ev === 'readable' && !this._readableState.endEmitted) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        processNextTick(nReadingNextTick, this);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

function nReadingNextTick(self) {
  debug('readable nexttick read 0');
  self.read(0);
}

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function () {
  var state = this._readableState;
  if (!state.flowing) {
    debug('resume');
    state.flowing = true;
    resume(this, state);
  }
  return this;
};

function resume(stream, state) {
  if (!state.resumeScheduled) {
    state.resumeScheduled = true;
    processNextTick(resume_, stream, state);
  }
}

function resume_(stream, state) {
  if (!state.reading) {
    debug('resume read 0');
    stream.read(0);
  }

  state.resumeScheduled = false;
  stream.emit('resume');
  flow(stream);
  if (state.flowing && !state.reading) stream.read(0);
}

Readable.prototype.pause = function () {
  debug('call pause flowing=%j', this._readableState.flowing);
  if (false !== this._readableState.flowing) {
    debug('pause');
    this._readableState.flowing = false;
    this.emit('pause');
  }
  return this;
};

function flow(stream) {
  var state = stream._readableState;
  debug('flow', state.flowing);
  if (state.flowing) {
    do {
      var chunk = stream.read();
    } while (null !== chunk && state.flowing);
  }
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function (stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function () {
    debug('wrapped end');
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function (chunk) {
    debug('wrapped data');
    if (state.decoder) chunk = state.decoder.write(chunk);

    // don't skip over falsy values in objectMode
    if (state.objectMode && (chunk === null || chunk === undefined)) return;else if (!state.objectMode && (!chunk || !chunk.length)) return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (this[i] === undefined && typeof stream[i] === 'function') {
      this[i] = function (method) {
        return function () {
          return stream[method].apply(stream, arguments);
        };
      }(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function (ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function (n) {
    debug('wrapped _read', n);
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};

// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0) return null;

  if (length === 0) ret = null;else if (objectMode) ret = list.shift();else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode) ret = list.join('');else if (list.length === 1) ret = list[0];else ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode) ret = '';else ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode) ret += buf.slice(0, cpy);else buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length) list[0] = buf.slice(cpy);else list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0) throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted) {
    state.ended = true;
    processNextTick(endReadableNT, state, stream);
  }
}

function endReadableNT(state, stream) {
  // Check that we didn't get one last unshift.
  if (!state.endEmitted && state.length === 0) {
    state.endEmitted = true;
    stream.readable = false;
    stream.emit('end');
  }
}

function forEach(xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf(xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}
}).call(this,require('_process'))
},{"./_stream_duplex":8,"_process":undefined,"buffer":undefined,"core-util-is":11,"events":undefined,"inherits":13,"isarray":15,"process-nextick-args":48,"string_decoder/":49,"util":undefined}],10:[function(require,module,exports){
(function (process){
// A bit simpler than readable streams.
// Implement an async ._write(chunk, encoding, cb), and it'll handle all
// the drain event emission and buffering.

'use strict';

module.exports = Writable;

/*<replacement>*/
var processNextTick = require('process-nextick-args');
/*</replacement>*/

/*<replacement>*/
var asyncWrite = !process.browser && ['v0.10', 'v0.9.'].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : processNextTick;
/*</replacement>*/

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

/*<replacement>*/
var internalUtil = {
  deprecate: require('util-deprecate')
};
/*</replacement>*/

/*<replacement>*/
var Stream;
(function () {
  try {
    Stream = require('st' + 'ream');
  } catch (_) {} finally {
    if (!Stream) Stream = require('events').EventEmitter;
  }
})();
/*</replacement>*/

var Buffer = require('buffer').Buffer;

util.inherits(Writable, Stream);

function nop() {}

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
  this.next = null;
}

var Duplex;
function WritableState(options, stream) {
  Duplex = Duplex || require('./_stream_duplex');

  options = options || {};

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  if (stream instanceof Duplex) this.objectMode = this.objectMode || !!options.writableObjectMode;

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  var defaultHwm = this.objectMode ? 16 : 16 * 1024;
  this.highWaterMark = hwm || hwm === 0 ? hwm : defaultHwm;

  // cast to ints.
  this.highWaterMark = ~ ~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // when true all writes will be buffered until .uncork() call
  this.corked = 0;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, because any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function (er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.bufferedRequest = null;
  this.lastBufferedRequest = null;

  // number of pending user-supplied write callbacks
  // this must be 0 before 'finish' can be emitted
  this.pendingcb = 0;

  // emit prefinish if the only thing we're waiting for is _write cbs
  // This is relevant for synchronous Transform streams
  this.prefinished = false;

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;

  // count buffered requests
  this.bufferedRequestCount = 0;

  // create the two objects needed to store the corked requests
  // they are not a linked list, as no new elements are inserted in there
  this.corkedRequestsFree = new CorkedRequest(this);
  this.corkedRequestsFree.next = new CorkedRequest(this);
}

WritableState.prototype.getBuffer = function writableStateGetBuffer() {
  var current = this.bufferedRequest;
  var out = [];
  while (current) {
    out.push(current);
    current = current.next;
  }
  return out;
};

(function () {
  try {
    Object.defineProperty(WritableState.prototype, 'buffer', {
      get: internalUtil.deprecate(function () {
        return this.getBuffer();
      }, '_writableState.buffer is deprecated. Use _writableState.getBuffer ' + 'instead.')
    });
  } catch (_) {}
})();

var Duplex;
function Writable(options) {
  Duplex = Duplex || require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex)) return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  if (options) {
    if (typeof options.write === 'function') this._write = options.write;

    if (typeof options.writev === 'function') this._writev = options.writev;
  }

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function () {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};

function writeAfterEnd(stream, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  processNextTick(cb, er);
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;

  if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string' && chunk !== null && chunk !== undefined && !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    processNextTick(cb, er);
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function (chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer.isBuffer(chunk)) encoding = 'buffer';else if (!encoding) encoding = state.defaultEncoding;

  if (typeof cb !== 'function') cb = nop;

  if (state.ended) writeAfterEnd(this, cb);else if (validChunk(this, state, chunk, cb)) {
    state.pendingcb++;
    ret = writeOrBuffer(this, state, chunk, encoding, cb);
  }

  return ret;
};

Writable.prototype.cork = function () {
  var state = this._writableState;

  state.corked++;
};

Writable.prototype.uncork = function () {
  var state = this._writableState;

  if (state.corked) {
    state.corked--;

    if (!state.writing && !state.corked && !state.finished && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
  }
};

Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
  // node::ParseEncoding() requires lower case.
  if (typeof encoding === 'string') encoding = encoding.toLowerCase();
  if (!(['hex', 'utf8', 'utf-8', 'ascii', 'binary', 'base64', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le', 'raw'].indexOf((encoding + '').toLowerCase()) > -1)) throw new TypeError('Unknown encoding: ' + encoding);
  this._writableState.defaultEncoding = encoding;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode && state.decodeStrings !== false && typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);

  if (Buffer.isBuffer(chunk)) encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret) state.needDrain = true;

  if (state.writing || state.corked) {
    var last = state.lastBufferedRequest;
    state.lastBufferedRequest = new WriteReq(chunk, encoding, cb);
    if (last) {
      last.next = state.lastBufferedRequest;
    } else {
      state.bufferedRequest = state.lastBufferedRequest;
    }
    state.bufferedRequestCount += 1;
  } else {
    doWrite(stream, state, false, len, chunk, encoding, cb);
  }

  return ret;
}

function doWrite(stream, state, writev, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  if (writev) stream._writev(chunk, state.onwrite);else stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  --state.pendingcb;
  if (sync) processNextTick(cb, er);else cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er) onwriteError(stream, state, sync, er, cb);else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(state);

    if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
      clearBuffer(stream, state);
    }

    if (sync) {
      /*<replacement>*/
      asyncWrite(afterWrite, stream, state, finished, cb);
      /*</replacement>*/
    } else {
        afterWrite(stream, state, finished, cb);
      }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished) onwriteDrain(stream, state);
  state.pendingcb--;
  cb();
  finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}

// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;
  var entry = state.bufferedRequest;

  if (stream._writev && entry && entry.next) {
    // Fast case, write everything using _writev()
    var l = state.bufferedRequestCount;
    var buffer = new Array(l);
    var holder = state.corkedRequestsFree;
    holder.entry = entry;

    var count = 0;
    while (entry) {
      buffer[count] = entry;
      entry = entry.next;
      count += 1;
    }

    doWrite(stream, state, true, state.length, buffer, '', holder.finish);

    // doWrite is always async, defer these to save a bit of time
    // as the hot path ends with doWrite
    state.pendingcb++;
    state.lastBufferedRequest = null;
    state.corkedRequestsFree = holder.next;
    holder.next = null;
  } else {
    // Slow case, write chunks one-by-one
    while (entry) {
      var chunk = entry.chunk;
      var encoding = entry.encoding;
      var cb = entry.callback;
      var len = state.objectMode ? 1 : chunk.length;

      doWrite(stream, state, false, len, chunk, encoding, cb);
      entry = entry.next;
      // if we didn't call the onwrite immediately, then
      // it means that we need to wait until it does.
      // also, that means that the chunk and cb are currently
      // being processed, so move the buffer counter past them.
      if (state.writing) {
        break;
      }
    }

    if (entry === null) state.lastBufferedRequest = null;
  }

  state.bufferedRequestCount = 0;
  state.bufferedRequest = entry;
  state.bufferProcessing = false;
}

Writable.prototype._write = function (chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype._writev = null;

Writable.prototype.end = function (chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);

  // .end() fully uncorks
  if (state.corked) {
    state.corked = 1;
    this.uncork();
  }

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished) endWritable(this, state, cb);
};

function needFinish(state) {
  return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
}

function prefinish(stream, state) {
  if (!state.prefinished) {
    state.prefinished = true;
    stream.emit('prefinish');
  }
}

function finishMaybe(stream, state) {
  var need = needFinish(state);
  if (need) {
    if (state.pendingcb === 0) {
      prefinish(stream, state);
      state.finished = true;
      stream.emit('finish');
    } else {
      prefinish(stream, state);
    }
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished) processNextTick(cb);else stream.once('finish', cb);
  }
  state.ended = true;
  stream.writable = false;
}

// It seems a linked list but it is not
// there will be only 2 of these for each stream
function CorkedRequest(state) {
  var _this = this;

  this.next = null;
  this.entry = null;

  this.finish = function (err) {
    var entry = _this.entry;
    _this.entry = null;
    while (entry) {
      var cb = entry.callback;
      state.pendingcb--;
      cb(err);
      entry = entry.next;
    }
    if (state.corkedRequestsFree) {
      state.corkedRequestsFree.next = _this;
    } else {
      state.corkedRequestsFree = _this;
    }
  };
}
}).call(this,require('_process'))
},{"./_stream_duplex":8,"_process":undefined,"buffer":undefined,"core-util-is":11,"events":undefined,"inherits":13,"process-nextick-args":48,"util-deprecate":53}],11:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.

function isArray(arg) {
  if (Array.isArray) {
    return Array.isArray(arg);
  }
  return objectToString(arg) === '[object Array]';
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = Buffer.isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}

}).call(this,{"isBuffer":require("../../is-buffer/index.js")})
},{"../../is-buffer/index.js":14}],12:[function(require,module,exports){

/*global console*/
'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _bl = require('bl');

/**
 * CrossPlatform CryptLib
   * This cross platform CryptLib uses AES 256 for encryption. This library can
   * be used for encryptoion and de-cryption of string on iOS, Android, Windows
   * and Node platform.
   * Features:
   * 1. 256 bit AES encryption
   * 2. Random IV generation.
   * 3. Provision for SHA256 hashing of key.
 */

var _bl2 = _interopRequireDefault(_bl);

var CryptLib = (function () {
  function CryptLib() {
    _classCallCheck(this, CryptLib);

    this._maxKeySize = 32;
    this._maxIVSize = 16;
    this._algorithm = 'AES-256-CBC';
    this._charset = 'utf8';
    this._encoding = 'base64';
    this._hashAlgo = 'sha256';
    this._digestEncoding = 'hex';

    this._characterMatrixForRandomIVStringGeneration = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '_'];
  }

  /**
   * private function: _encryptDecrypt
   * encryptes or decrypts to or from text or encrypted text given an iv and key
   * @param  {string}  text        can be plain text or encrypted text
   * @param  {string}  key         the key used to encrypt or decrypt
   * @param  {string}  initVector  the initialization vector to encrypt or
   *                               decrypt
   * @param  {bool}    isEncrypt   true = encryption, false = decryption
   * @return {string}              encryted text or plain text
   */

  _createClass(CryptLib, [{
    key: '_encryptDecrypt',
    value: function _encryptDecrypt(text, key, initVector, isEncrypt) {

      if (!text || !key) {
        throw 'cryptLib._encryptDecrypt: -> key and plain or encrypted text ' + 'required';
      }

      var ivBl = new _bl2['default'](),
          keyBl = new _bl2['default'](),
          keyCharArray = key.split(''),
          ivCharArray = [],
          encryptor = undefined,
          decryptor = undefined,
          clearText = undefined;

      if (initVector && initVector.length > 0) {
        ivCharArray = initVector.split('');
      }

      for (var i = 0; i < this._maxIVSize; i++) {
        ivBl.append(ivCharArray.shift() || [null]);
      }

      for (var i = 0; i < this._maxKeySize; i++) {
        keyBl.append(keyCharArray.shift() || [null]);
      }

      if (isEncrypt) {
        encryptor = _crypto2['default'].createCipheriv(this._algorithm, keyBl.toString(), ivBl.toString());
        encryptor.setEncoding(this._encoding);
        encryptor.write(text);
        encryptor.end();
        return encryptor.read();
      }

      decryptor = _crypto2['default'].createDecipheriv(this._algorithm, keyBl.toString(), ivBl.toString());
      var dec = decryptor.update(text, this._encoding, this._charset);
      dec += decryptor.final(this._charset);
      return dec;
    }

    /**
     * private function: _isCorrectLength
     * checks if length is preset and is a whole number and > 0
     * @param  {int}  length
     * @return {bool}
    */
  }, {
    key: '_isCorrectLength',
    value: function _isCorrectLength(length) {
      return length && /^\d+$/.test(length) && parseInt(length, 10) !== 0;
    }

    /**
     * generates random initaliztion vector given a length
     * @param  {int}  length  the length of the iv to be generated
     */
  }, {
    key: 'generateRandomIV',
    value: function generateRandomIV(length) {
      if (!this._isCorrectLength(length)) {
        throw 'cryptLib.generateRandomIV() -> needs length or in wrong format';
      }

      var randomBytes = _crypto2['default'].randomBytes(length),
          _iv = [];

      for (var i = 0; i < length; i++) {
        var ptr = randomBytes[i] % this._characterMatrixForRandomIVStringGeneration.length;
        _iv[i] = this._characterMatrixForRandomIVStringGeneration[ptr];
      }
      return _iv.join('');
    }

    /**
     * Creates a hash of a key using SHA-256 algorithm
     * @param  {string} key     the key that will be hashed
     * @param  {int}    length  the length of the SHA-256 hash
     * @return {string}         the output hash generated given a key and length
     */
  }, {
    key: 'getHashSha256',
    value: function getHashSha256(key, length) {
      if (!key) {
        throw 'cryptLib.getHashSha256() -> needs key';
      }

      if (!this._isCorrectLength(length)) {
        throw 'cryptLib.getHashSha256() -> needs length or in wrong format';
      }

      return _crypto2['default'].createHash(this._hashAlgo).update(key).digest(this._digestEncoding).substring(0, length);
    }

    /**
     * encryptes plain text given a key and initialization vector
     * @param  {string}  text        can be plain text or encrypted text
     * @param  {string}  key         the key used to encrypt or decrypt
     * @param  {string}  initVector  the initialization vector to encrypt or
     *                               decrypt
     * @return {string}              encryted text or plain text
     */
  }, {
    key: 'encrypt',
    value: function encrypt(plainText, key, initVector) {
      return this._encryptDecrypt(plainText, key, initVector, true);
    }

    /**
     * decrypts encrypted text given a key and initialization vector
     * @param  {string}  text        can be plain text or encrypted text
     * @param  {string}  key         the key used to encrypt or decrypt
     * @param  {string}  initVector  the initialization vector to encrypt or
     *                               decrypt
     * @return {string}              encryted text or plain text
     */
  }, {
    key: 'decrypt',
    value: function decrypt(encryptedText, key, initVector) {
      return this._encryptDecrypt(encryptedText, key, initVector, false);
    }
  }]);

  return CryptLib;
})();

exports['default'] = new CryptLib();
module.exports = exports['default'];
},{"bl":6,"crypto":undefined}],13:[function(require,module,exports){
module.exports = require('util').inherits

},{"util":undefined}],14:[function(require,module,exports){
/**
 * Determine if an object is Buffer
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install is-buffer`
 */

module.exports = function (obj) {
  return !!(obj != null &&
    (obj._isBuffer || // For Safari 5-7 (missing Object.prototype.constructor)
      (obj.constructor &&
      typeof obj.constructor.isBuffer === 'function' &&
      obj.constructor.isBuffer(obj))
    ))
}

},{}],15:[function(require,module,exports){
var toString = {}.toString;

module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};

},{}],16:[function(require,module,exports){
/**
 * So far all this does is parse app key and return it, 
 * but one day it might do more.
 */

var parseAppKey = require('./parse-app-key');

module.exports = function(context) {
  return parseAppKey(context.apiContext.appKey);
};
},{"./parse-app-key":17}],17:[function(require,module,exports){
/**
 * This is a pretty naive implementation for now,
 * but since AppDev validates this pretty stringently,
 * it'll always work in the current environment (1.18).
 */

module.exports = function(key) {
  var parts = key.split('.')
  return {
    namespace: parts[0],
    id: parts[1],
    version: [parts[2],parts[3],parts[4]].join('.')
  };
}
},{}],18:[function(require,module,exports){
module.exports={
  "Production/Sandbox": {
    "homeDomain": "https://home.mozu.com",
    "paymentServiceTenantPodDomain": "https://pmts.mozu.com",
    "paymentServiceSandboxDomain": "https://payments-sb.mozu.com"
  },
  "Staging": {
    "homeDomain": "https://home.staging.mozu.com",
    "paymentServiceTenantPodDomain": "http://services.staging-hp.prod.mozu.com",
    "paymentServiceSandboxDomain": "http://services.staging-hp.prod.mozu.com"
  },
  "QA": {
    "homeDomain": "https://home.mozu-qa.com",
    "paymentServiceTenantPodDomain": "https://payments-qa.dev.volusion.com",
    "paymentServiceSandboxDomain": "https://services-sandbox-mozu-qa.dev.volusion.com"
  },
  "SI": {
    "homeDomain": "https://home.mozu-si.com",
    "paymentServiceTenantPodDomain": "https://payments.mozu-si.com",
    "paymentServiceSandboxDomain": "https://payments.mozu-si.com"
  },
  "CI": {
    "homeDomain": "http://aus02ncrprx001.dev.volusion.com",
    "paymentServiceTenantPodDomain": "http://AUS02NCSERV001.dev.volusion.com",
    "paymentServiceSandboxDomain": "http://AUS02NCSERV001.dev.volusion.com"
  }
}

},{}],19:[function(require,module,exports){
(function (process){
'use strict';

var extend = require('./utils/tiny-extend'),
    _sub = require('./utils/sub'),
    constants = require('./constants'),
    makeMethod = require('./utils/make-method'),
    getConfig = require('./utils/get-config'),
    normalizeContext = require('./utils/normalize-context'),
    inMemoryAuthCache = require('./plugins/in-memory-auth-cache'),
    serverSidePrerequisites = require('./plugins/server-side-prerequisites'),
    expandUriTemplateFromContext = require('./plugins/expand-uritemplate-from-context'),
    versionKey = constants.headers.VERSION,
    version = constants.version;

var NodeDefaultPlugins = {
  authenticationStorage: inMemoryAuthCache,
  prerequisiteTasks: serverSidePrerequisites,
  urlResolver: expandUriTemplateFromContext
};

function applyDefaultPlugins(client, plugins) {
  Object.keys(plugins).forEach(function (n) {
    return client[n] = plugins[n](client);
  });
}

function makeClient(clientCls) {
  return function (cfg) {
    return new clientCls(extend({}, this, cfg));
  };
}

function cloneContext(ctx) {
  var newCtx;
  if (!ctx) return {};
  try {
    newCtx = JSON.parse(JSON.stringify(ctx));
  } catch (e) {
    throw new Error('Could not serialize context when creating Client. ' + 'Do not assign non-serializable objects to the client.context.');
  }
  newCtx[versionKey] = newCtx[versionKey] || version;
  return newCtx;
}

function isContextSufficient(context) {
  return context && context.baseUrl;
}

function Client(cfg) {
  cfg = cfg || {};
  var context = normalizeContext(cfg.apiContext || cfg.context || {});
  if (!isContextSufficient(context)) {
    context = context ? extend(getConfig(), context) : getConfig();
  }
  this.context = cloneContext(context);
  this.defaultRequestOptions = extend({}, Client.defaultRequestOptions, cfg.defaultRequestOptions);
  // apply the right default plugin config for a server-side environment
  // (that is, Node, ArcJS, or perhaps Rhino/Nashorn/WinJS)
  if (typeof process !== "undefined") {
    applyDefaultPlugins(this, NodeDefaultPlugins);
  }
  if (cfg.plugins) {
    // override plugins if necessary
    this.plugins = cfg.plugins.slice();
    this.plugins.forEach(function (p) {
      p(this);
    }.bind(this));
  }
}

// statics
extend(Client, {
  defaultRequestOptions: {},
  method: makeMethod,
  sub: function sub(methods) {
    return makeClient(_sub(Client, methods));
  },
  constants: constants
});

module.exports = Client;
}).call(this,require('_process'))
},{"./constants":23,"./plugins/expand-uritemplate-from-context":24,"./plugins/in-memory-auth-cache":25,"./plugins/server-side-prerequisites":31,"./utils/get-config":35,"./utils/make-method":37,"./utils/normalize-context":38,"./utils/sub":42,"./utils/tiny-extend":44,"_process":undefined}],20:[function(require,module,exports){


//------------------------------------------------------------------------------
// <auto-generated>
//     This code was generated by CodeZu.     
//
//     Changes to this file may cause incorrect behavior and will be lost if
//     the code is regenerated.
// </auto-generated>
//------------------------------------------------------------------------------

var Client = require('../../../client'), constants = Client.constants;

module.exports = Client.sub({
	getAccounts: Client.method({
		method: constants.verbs.GET,
		url: '{+tenantPod}api/commerce/customer/accounts/?startIndex={startIndex}&pageSize={pageSize}&sortBy={sortBy}&filter={filter}&fields={fields}&q={q}&qLimit={qLimit}&isAnonymous={isAnonymous}&responseFields={responseFields}'
	}),
	getLoginState: Client.method({
		method: constants.verbs.GET,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}/loginstate?responseFields={responseFields}'
	}),
	getAccount: Client.method({
		method: constants.verbs.GET,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}?responseFields={responseFields}'
	}),
	addAccount: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/?responseFields={responseFields}'
	}),
	changePassword: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}/Change-Password?unlockAccount={unlockAccount}'
	}),
	addLoginToExistingCustomer: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}/Create-Login?responseFields={responseFields}'
	}),
	recomputeCustomerLifetimeValue: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}/recomputelifetimevalue'
	}),
	setLoginLocked: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}/Set-Login-Locked'
	}),
	setPasswordChangeRequired: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}/Set-Password-Change-Required'
	}),
	addAccountAndLogin: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/Add-Account-And-Login?responseFields={responseFields}'
	}),
	addAccounts: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/Bulk?responseFields={responseFields}'
	}),
	changePasswords: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/Change-Passwords?responseFields={responseFields}'
	}),
	getLoginStateByEmailAddress: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/loginstatebyemailaddress?emailAddress={emailAddress}&responseFields={responseFields}'
	}),
	getLoginStateByUserName: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/loginstatebyusername?userName={userName}&responseFields={responseFields}'
	}),
	resetPassword: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/commerce/customer/accounts/Reset-Password'
	}),
	updateAccount: Client.method({
		method: constants.verbs.PUT,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}?responseFields={responseFields}'
	}),
	deleteAccount: Client.method({
		method: constants.verbs.DELETE,
		url: '{+tenantPod}api/commerce/customer/accounts/{accountId}'
	})
});

},{"../../../client":19}],21:[function(require,module,exports){


//------------------------------------------------------------------------------
// <auto-generated>
//     This code was generated by CodeZu.     
//
//     Changes to this file may cause incorrect behavior and will be lost if
//     the code is regenerated.
// </auto-generated>
//------------------------------------------------------------------------------

var Client = require('../../../client'), constants = Client.constants;

module.exports = Client.sub({
	getEntity: Client.method({
		method: constants.verbs.GET,
		url: '{+tenantPod}api/platform/entitylists/{entityListFullName}/entities/{id}?responseFields={responseFields}'
	}),
	getEntities: Client.method({
		method: constants.verbs.GET,
		url: '{+tenantPod}api/platform/entitylists/{entityListFullName}/entities?pageSize={pageSize}&startIndex={startIndex}&filter={filter}&sortBy={sortBy}&responseFields={responseFields}'
	}),
	insertEntity: Client.method({
		method: constants.verbs.POST,
		url: '{+tenantPod}api/platform/entitylists/{entityListFullName}/entities/?responseFields={responseFields}'
	}),
	updateEntity: Client.method({
		method: constants.verbs.PUT,
		url: '{+tenantPod}api/platform/entitylists/{entityListFullName}/entities/{id}?responseFields={responseFields}'
	}),
	deleteEntity: Client.method({
		method: constants.verbs.DELETE,
		url: '{+tenantPod}api/platform/entitylists/{entityListFullName}/entities/{id}'
	})
});

},{"../../../client":19}],22:[function(require,module,exports){


//------------------------------------------------------------------------------
// <auto-generated>
//     This code was generated by CodeZu.     
//
//     Changes to this file may cause incorrect behavior and will be lost if
//     the code is regenerated.
// </auto-generated>
//------------------------------------------------------------------------------

var Client = require('../../client'), constants = Client.constants;

module.exports = Client.sub({
	getTenant: Client.method({
		method: constants.verbs.GET,
		url: '{+homePod}api/platform/tenants/{tenantId}?responseFields={responseFields}'
	})
});

},{"../../client":19}],23:[function(require,module,exports){
'use strict';

var version = require('./version'),
    DEVELOPER = 1,
    ADMINUSER = 2,
    SHOPPER = 4,
    TENANT = 8,
    SITE = 16,
    MASTERCATALOG = 32,
    CATALOG = 64,
    APP_ONLY = 128,
    NONE = 256,
    APP_REQUIRED = 512;

// scopes are not yet in use, but when the services can reflect
// their required scope, here will be all the bitmask constants

// some contexts are always additive

TENANT |= ADMINUSER;
SITE |= TENANT;
MASTERCATALOG |= TENANT;
CATALOG |= MASTERCATALOG;
SHOPPER |= SITE | CATALOG;

module.exports = {
  scopes: {
    APP_REQUIRED: APP_REQUIRED,
    DEVELOPER: DEVELOPER,
    ADMINUSER: ADMINUSER,
    SHOPPER: SHOPPER,
    TENANT: TENANT,
    SITE: SITE,
    MASTERCATALOG: MASTERCATALOG,
    CATALOG: CATALOG,
    APP_ONLY: APP_ONLY,
    NONE: NONE
  },
  verbs: {
    GET: 'GET',
    POST: 'POST',
    PUT: 'PUT',
    DELETE: 'DELETE'
  },
  headerPrefix: 'x-vol-',
  headers: {
    APPCLAIMS: 'app-claims',
    USERCLAIMS: 'user-claims',
    TENANT: 'tenant',
    SITE: 'site',
    MASTERCATALOG: 'master-catalog',
    CATALOG: 'catalog',
    DATAVIEWMODE: 'dataview-mode',
    VERSION: 'version',
    SHA256: 'hmac-sha256'
  },
  dataViewModes: {
    LIVE: 'Live',
    PENDING: 'Pending'
  },
  capabilityTimeoutInSeconds: 180,
  version: version.current
};
},{"./version":46}],24:[function(require,module,exports){
'use strict';

var getUrlTemplate = require('../utils/get-url-template');
var extend = require('../utils/tiny-extend');

function ensureTrailingSlash(url) {
  return url.charAt(url.length - 1) === '/' ? url : url + '/';
}

/**
 * Creates, evaluates based on context, and returns a string URL for a Mozu API request.
 * @param  {Object} context The context of a client. Should have a `baseUrl` property at minimum.
 * @param  {string} tpt     A string to be compiled into a UriTemplate. Should be a valid UriTemplate.
 * @param  {Object} body      An object consisting of the JSON body of the request, to be used to interpolate URL paramters.
 * @return {string}         A fully qualified URL.
 */
module.exports = function () {
  return function (client, tpt, body) {
    var context = client.context;
    var template = getUrlTemplate(tpt);
    var fullTptEvalCtx = extend(
    // aliases for pod URLs and IDs first
    {
      homePod: context.baseUrl,
      pciPod: context.basePciUrl,
      tenantId: context.tenant,
      siteId: context.site,
      catalogId: context.catalog,
      masterCatalogId: context['master-catalog']
    },
    // all context values override those base values if provided
    context,
    // any matching values in the body override last.
    body);

    // ensure all base URLs have trailing slashes.
    ['homePod', 'pciPod', 'tenantPod'].forEach(function (x) {
      if (fullTptEvalCtx[x]) fullTptEvalCtx[x] = ensureTrailingSlash(fullTptEvalCtx[x]);
    });

    // don't pass the API version!
    if (!body || !body.hasOwnProperty("version")) delete fullTptEvalCtx.version;

    return template.render(fullTptEvalCtx);
  };
};
},{"../utils/get-url-template":36,"../utils/tiny-extend":44}],25:[function(require,module,exports){
(function (process){
'use strict';

var assert = require('assert');

function isExpired(ticket) {
  var ungraceperiod = 60000;
  var compareDate = new Date();
  compareDate.setTime(compareDate.getTime() + ungraceperiod);
  return new Date(ticket.refreshTokenExpiration) < compareDate;
}

function generateCacheKey(claimtype, context) {
  var cmps;
  if (!process.env.mozuHosted) {
    assert(context.appKey, "No application key in context!");
    cmps = [context.appKey];
  } else {
    cmps = ['mozuHosted'];
  }
  switch (claimtype) {
    case "developer":
      assert(context.developerAccount && context.developerAccount.emailAddress, "No developer account email address in context!");
      cmps.push(context.developerAccount.emailAddress, context.developerAccountId);
      break;
    case "admin-user":
      assert(context.tenant, "No tenant in context!");
      assert(context.adminUser && context.adminUser.emailAddress, "No admin user email address in context!");
      cmps.push(context.tenant, context.adminUser.emailAddress);
      break;
    default:
      break;
  }
  return cmps.join();
}

module.exports = function InMemoryAuthCache() {
  var claimsCaches = {
    application: {},
    developer: {},
    'admin-user': {}
  };

  return {
    get: function get(claimtype, context, callback) {
      var ticket = claimsCaches[claimtype][generateCacheKey(claimtype, context)];
      setImmediate(function () {
        callback(null, ticket && !isExpired(ticket) && ticket || undefined);
      });
    },
    set: function set(claimtype, context, ticket, callback) {
      claimsCaches[claimtype][generateCacheKey(claimtype, context)] = ticket;
      setImmediate(callback);
    },
    constructor: InMemoryAuthCache
  };
};
}).call(this,require('_process'))
},{"_process":undefined,"assert":undefined}],26:[function(require,module,exports){
'use strict';

var AuthProvider = require('../../security/auth-provider');
var scopes = require('../../constants').scopes;
var getScopeFromState = require('./get-scope-from-state');

/**
 * If necessary, add application claims to a client context before
 * placing a request. Relies on a `scope` parameter to specify.
 * Uses AuthProvider.
 */

module.exports = function (state) {
  var client = state.client;

  var scope = getScopeFromState(state);

  if (scope & scopes.APP_REQUIRED || !(scope & scopes.NONE || scope & scopes.DEVELOPER)) {
    return AuthProvider.addPlatformAppClaims(client).then(function () {
      return state;
    });
  } else {
    return state;
  }
};
},{"../../constants":23,"../../security/auth-provider":32,"./get-scope-from-state":30}],27:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var TenantCache = require('../../utils/tenant-cache');
var EnvUrls = require('mozu-metadata/data/environments.json');
var getUrlTemplate = require('../../utils/get-url-template');
var getScopeFromState = require('./get-scope-from-state');

/**
 * If necessary, transforms a promise for a prepared client into a promise
 * for a client that has a `basePciUrl` in its context.
 * Reads from the TenantCache if necessary, and consumes mozu-metadata.
 */

var PCIUrlsByBaseUrl = Object.keys(EnvUrls).reduce(function (o, c) {
  o[EnvUrls[c].homeDomain] = EnvUrls[c];
  return o;
}, {});

module.exports = function (state) {
  var client = state.client;
  var requestConfig = state.requestConfig;
  var url = requestConfig.url;

  if (~getUrlTemplate(url).keysUsed.indexOf('pciPod') && !client.context.basePciUrl && !client.context.pciPod) {
    var _ret = function () {
      var tenantId = client.context.tenantId || client.context.tenant;
      var pciUrls = PCIUrlsByBaseUrl[client.context.baseUrl];
      if (!tenantId) {
        throw new Error('Could not place request to ' + url + ' because it requires a tenant ' + 'ID to be set in the client context.');
      } else if (!pciUrls) {
        throw new Error('Could not place request to ' + url + ' because it is making a call to ' + 'Payment Service, but there is no known payment service domain ' + ('matching the environment whose base URL is ' + client.context.baseUrl + '.'));
      } else {
        return {
          v: TenantCache.get(tenantId, client, getScopeFromState(state)).then(function (t) {
            if (t.isDevTenant) {
              client.context.basePciUrl = pciUrls.paymentServiceSandboxDomain;
            } else {
              client.context.basePciUrl = pciUrls.paymentServiceTenantPodDomain;
            }
            return state;
          })
        };
      }
    }();

    if ((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object") return _ret.v;
  } else {
    return state;
  }
};
},{"../../utils/get-url-template":36,"../../utils/tenant-cache":43,"./get-scope-from-state":30,"mozu-metadata/data/environments.json":18}],28:[function(require,module,exports){
'use strict';

var TenantCache = require('../../utils/tenant-cache');
var getUrlTemplate = require('../../utils/get-url-template');
var getScopeFromState = require('./get-scope-from-state');

/**
 * If necessary, transforms a promise for a prepared client into a promise
 * for a client that has a `tenantPod` in its context.
 * Reads from the TenantCache if necessary.
 */

module.exports = function (state) {
  var client = state.client;
  var requestConfig = state.requestConfig;
  var url = requestConfig.url;

  if (~getUrlTemplate(url).keysUsed.indexOf('tenantPod') && !client.context.tenantPod) {
    var tenantId = client.context.tenantId || client.context.tenant;
    if (!tenantId) {
      throw new Error('Could not place request to ' + url + ' because it requires a tenant ' + 'ID to be set in the client context.');
    } else {
      return TenantCache.get(tenantId, client, getScopeFromState(state)).then(function (tenant) {
        client.context.tenantPod = 'https://' + tenant.domain + '/';
        return state;
      });
    }
  } else {
    return state;
  }
};
},{"../../utils/get-url-template":36,"../../utils/tenant-cache":43,"./get-scope-from-state":30}],29:[function(require,module,exports){
'use strict';

var AuthProvider = require('../../security/auth-provider');
var scopes = require('../../constants').scopes;
var getScopeFromState = require('./get-scope-from-state');

/**
 * If necessary, add developer user claims to a client context before
 * placing a request. Relies on a `scope` parameter to specify.
 * Uses AuthProvider.
 */

module.exports = function (state) {
  var client = state.client;
  var scope = getScopeFromState(state);

  if (scope & scopes.DEVELOPER) {
    return AuthProvider.addDeveloperUserClaims(client).then(function () {
      return state;
    });
  } else if (scope & scopes.ADMINUSER) {
    return AuthProvider.addAdminUserClaims(client).then(function () {
      return state;
    });
  } else if (!scope && AuthProvider.addMostRecentUserClaims) {
    return AuthProvider.addMostRecentUserClaims(client).then(function () {
      return state;
    });
  } else {
    return state;
  }
};
},{"../../constants":23,"../../security/auth-provider":32,"./get-scope-from-state":30}],30:[function(require,module,exports){
'use strict';

var scopes = require('../../constants').scopes;

/**
 * From a given prerequisite state object (config, options, requestConfig)
 * return scope.
 */

module.exports = function (state) {
  var requestConfig = state.requestConfig;
  var options = state.options;

  if (options && options.scope) {
    if (scopes[options.scope]) {
      return scopes[options.scope];
    } else {
      return options.scope;
    }
  } else {
    return requestConfig.scope;
  }
};
},{"../../constants":23}],31:[function(require,module,exports){
'use strict';
/**
 * Sensible default configuration for a NodeJS, ArcJS, or other server env.
 * Includes assumptions that you'll have access to Tenant Service, etc.
 * Not appropriate for shopper or storefront use.
 */

module.exports = function () {
  return [require('./ensure-tenant-pod-url'), require('./ensure-pci-pod-url'), require('./ensure-user-claims'), require('./ensure-app-claims')];
};
},{"./ensure-app-claims":26,"./ensure-pci-pod-url":27,"./ensure-tenant-pod-url":28,"./ensure-user-claims":29}],32:[function(require,module,exports){
/* eslint handle-callback-err: 0 */
/* global Promise */
'use strict';

var constants = require('../constants'),
    AuthTicket = require('./auth-ticket'),
    scopes = constants.scopes;

var TenantCache = require('../utils/tenant-cache');

// if (typeof Promise !== "function") require('when/es6-shim/Promise.browserify-es6');

function createMemoizedClientFactory(clientPath) {
  var c;
  return function () {
    return (c || (c = require(clientPath))).apply(this, arguments);
  };
}

var makeAppAuthClient = createMemoizedClientFactory('../clients/platform/applications/authTicket');
var makeDeveloperAuthClient = createMemoizedClientFactory('../clients/platform/developer/developerAdminUserAuthTicket');
var makeAdminUserAuthClient = createMemoizedClientFactory('../clients/platform/adminuser/tenantAdminUserAuthTicket');

function cacheDataAndCreateAuthTicket(res) {
  var tenants = res.availableTenants;
  if (tenants) {
    for (var i = 0; i < tenants.length; i++) {
      TenantCache.add(tenants[i]);
    }
  }
  return new AuthTicket(res);
}

function getPlatformAuthTicket(client) {
  return makeAppAuthClient(client).authenticateApp({
    applicationId: client.context.appKey,
    sharedSecret: client.context.sharedSecret
  }, {
    scope: scopes.NONE
  }).then(cacheDataAndCreateAuthTicket);
}

function refreshPlatformAuthTicket(client, ticket) {
  return makeAppAuthClient(client).refreshAppAuthTicket({
    refreshToken: ticket.refreshToken
  }, {
    scope: scopes.NONE
  }).then(cacheDataAndCreateAuthTicket);
}

function getDeveloperAuthTicket(client) {
  return makeDeveloperAuthClient(client).createDeveloperUserAuthTicket(client.context.developerAccount, {
    scope: scopes.NONE
  }).then(cacheDataAndCreateAuthTicket);
}

function refreshDeveloperAuthTicket(client, ticket) {
  return makeDeveloperAuthClient(client).refreshDeveloperAuthTicket(ticket, {
    scope: scopes.NONE
  }).then(cacheDataAndCreateAuthTicket);
}

function getAdminUserAuthTicket(client) {
  return makeAdminUserAuthClient(client).createUserAuthTicket({ tenantId: client.context.tenant }, {
    body: client.context.adminUser,
    scope: constants.scopes.APP_ONLY
  }).then(function (json) {
    client.context.user = json.user;
    return cacheDataAndCreateAuthTicket(json);
  });
}

function refreshAdminUserAuthTicket(client, ticket) {
  return makeAdminUserAuthClient(client).refreshAuthTicket(ticket, {
    scope: constants.scopes.APP_ONLY
  }).then(cacheDataAndCreateAuthTicket);
}

var calleeToClaimType = {
  'addPlatformAppClaims': 'application',
  'addDeveloperUserClaims': 'developer',
  'addAdminUserClaims': 'admin-user'
};

function makeClaimMemoizer(calleeName, requester, refresher, claimHeader) {
  return function (client) {
    var cacheAndUpdateClient = function cacheAndUpdateClient(ticket) {
      return new Promise(function (resolve) {
        client.authenticationStorage.set(calleeToClaimType[calleeName], client.context, ticket, function () {
          client.context[claimHeader] = ticket.accessToken;
          resolve(client);
        });
      });
    };
    var op = new Promise(function (resolve) {
      client.authenticationStorage.get(calleeToClaimType[calleeName], client.context, function (err, ticket) {
        resolve(ticket);
      });
    }).then(function (ticket) {
      if (!ticket) {
        return requester(client).then(cacheAndUpdateClient);
      }
      if (new Date(ticket.accessTokenExpiration) < new Date()) {
        return refresher(client, ticket).then(cacheAndUpdateClient);
      }
      client.context[claimHeader] = ticket.accessToken;
      return client;
    });
    function setRecent() {
      AuthProvider.addMostRecentUserClaims = AuthProvider[calleeName];
    }
    op.then(setRecent, setRecent);
    return op;
  };
}

var AuthProvider = {

  addPlatformAppClaims: makeClaimMemoizer('addPlatformAppClaims', getPlatformAuthTicket, refreshPlatformAuthTicket, constants.headers.APPCLAIMS),
  addDeveloperUserClaims: makeClaimMemoizer('addDeveloperUserClaims', getDeveloperAuthTicket, refreshDeveloperAuthTicket, constants.headers.USERCLAIMS),
  addAdminUserClaims: makeClaimMemoizer('addAdminUserClaims', getAdminUserAuthTicket, refreshAdminUserAuthTicket, constants.headers.USERCLAIMS),
  addMostRecentUserClaims: false
};

module.exports = AuthProvider;
},{"../constants":23,"../utils/tenant-cache":43,"./auth-ticket":33}],33:[function(require,module,exports){
'use strict';

/**
 * The authentication ticket used to authenticate anything.
 * @class AuthTicket
 * @property {string} accessToken The token that stores an encrypted list of the application's configured behaviors and authenticates the application.
 * @property {Date} accessTokenExpiration Date and time the access token expires. After the access token expires, refresh the authentication ticket using the refresh token.
 * @property {string} refreshToken The token that refreshes the application's authentication ticket.
 * @property {Date} refreshTokenExpiration Date and time the refresh token expires. After the refresh token expires, generate a new authentication ticket.
 */

function AuthTicket(json) {
  var self = this;
  if (!(this instanceof AuthTicket)) return new AuthTicket(json);
  for (var p in json) {
    if (json.hasOwnProperty(p)) {
      self[p] = p.indexOf('Expiration') !== -1 ? new Date(json[p]) : json[p]; // dateify the dates, this'll break if the prop name changes
    }
  }
}

module.exports = AuthTicket;
},{}],34:[function(require,module,exports){
(function (Buffer){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var extend = require('./tiny-extend');
var util = require('util');
module.exports = function errorify(res, additions) {
  try {
    if (typeof res === "string") {
      return new Error(res);
    }
    var err;
    var message = ensureMessage(res);
    var stringBody = ensureString(res.body);
    var details = _typeof(res.body) === "object" ? res.body : (typeof res === 'undefined' ? 'undefined' : _typeof(res)) === "object" ? res : {};

    if (!message && stringBody) {
      try {
        details = JSON.parse(stringBody);
        message = details.message || stringBody;
      } catch (e) {
        message = stringBody;
      }
    }

    if (additions) {
      extend(details, additions);
    }

    message = (message || "Unknown error!") + formatDetails(details);

    err = new Error(message);
    err.originalError = details;
    return err;
  } catch (e) {
    return e;
  }
};

function formatDetails(deets) {
  return "\n\nDetails:\n" + Object.keys(deets).map(function (label) {
    var deet = deets[label];
    if ((typeof deet === 'undefined' ? 'undefined' : _typeof(deet)) === "object") deet = util.inspect(deet);
    return " " + label + ": " + deet;
  }).join('\n') + '\n';
}

function ensureString(something) {
  if (!something) return String(something);
  if (typeof something === "string") {
    return something;
  }
  if (Buffer.isBuffer(something)) {
    return something.toString('utf-8');
  }
  if (typeof something.toString === "function") {
    return something.toString();
  }
  return String(something);
}

function ensureMessage(res) {
  return res.message || res.body && res.body.message;
}

}).call(this,{"isBuffer":require("../../is-buffer/index.js")})
},{"../../is-buffer/index.js":14,"./tiny-extend":44,"util":undefined}],35:[function(require,module,exports){
(function (process){
'use strict';
// BEGIN INIT

var fs = require('fs');
var findup = require('./tiny-findup');

var legalConfigNames = ['mozu.config', 'mozu.config.json'];

module.exports = function getConfig() {
  var conf;
  if (process.env.mozuHosted) {
    try {
      conf = JSON.parse(process.env.mozuHosted).sdkConfig;
    } catch (e) {
      throw new Error("Mozu hosted configuration was unreadable: " + e.message);
    }
  } else {
    for (var i = legalConfigNames.length - 1; i >= 0; i--) {
      try {
        var filename = findup(legalConfigNames[i]);
        if (filename) conf = fs.readFileSync(filename, 'utf-8');
      } catch (e) {
        continue;
      }
      if (conf) break;
    }
    if (!conf) {
      throw new Error("No configuration file found. Either create a 'mozu.config' or 'mozu.config.json' file, or supply full config to the .client() method.");
    }
    try {
      conf = JSON.parse(conf);
    } catch (e) {
      throw new Error("Configuration file was unreadable: " + e.message);
    }
  }
  return conf;
};
}).call(this,require('_process'))
},{"./tiny-findup":45,"_process":undefined,"fs":undefined}],36:[function(require,module,exports){
'use strict';
/**
 * Memoized function to turn URI Template text strings into Template objects.
 *
 * Assumes that unescaped URI Template variables are required,
 * since they're always base URLs in the current codegen.
 *
 * @param {String} templateText The URI template string.
 * @returns {Template} Object with a `render` method and a `keysUsed` object.
 */

var expRe = /\{.+?\}/g;
var varnameRe = /[\w_-]+/;
function findKeys(rawTpt) {
  var matches = rawTpt.match(expRe);
  if (!matches) return [];
  return matches.map(function (x) {
    return x.match(varnameRe)[0];
  });
}

var uritemplate = require('uri-template');
var cache = {};
module.exports = function (templateText) {
  if (cache[templateText]) {
    return cache[templateText];
  }
  var tpt = uritemplate.parse(templateText);
  return cache[templateText] = {
    render: function render(x) {
      return tpt.expand(x);
    },
    keysUsed: findKeys(templateText)
  };
};
},{"uri-template":50}],37:[function(require,module,exports){
(function (process){
'use strict';

var extend = require('./tiny-extend');
var request = require('./request');

module.exports = function (config) {

  function doRequest(body, options) {
    options = options || {};
    var finalRequestConfig = extend({}, config, this.defaultRequestOptions, {
      url: this.urlResolver(this, config.url, body),
      context: this.context,
      body: body
    }, options);
    var finalMethod = finalRequestConfig.method && finalRequestConfig.method.toUpperCase();

    // this is magic and was never a good idea.
    // the way the SDK was designed, the first argument to a method will get
    // used both as the request payload and as an object to expand the URI
    // template. this resulted in collisions, and in unexpected behavior with
    // services that didn't expect strongly typed payloads. the below code
    // tried to fix it magically, but under certain circumstances it would be
    // very hard to debug.
    //
    // remove any properties from the body that were used to expand the url
    // if (body &&
    //     typeof body === "object" &&
    //     !Array.isArray(body) &&
    //     !options.body &&
    //     !options.includeUrlVariablesInPostBody &&
    //     (finalMethod === "POST" || finalMethod === "PUT")) {
    //   finalRequestConfig.body = Object.keys(body).reduce(function(m, k) {
    //     if (!urlSpec.keysUsed[k]) {
    //       m[k] = body[k];
    //     }
    //     return m;
    //   }, {});
    //   if (Object.keys(finalRequestConfig.body).length === 0) {
    //     delete finalRequestConfig.body;
    //   }
    // }

    if (finalMethod === "GET" || finalMethod === "DELETE" && !options.body) {
      delete finalRequestConfig.body;
      // it's outlived its usefulness, we've already made a url with it
    }
    return request(finalRequestConfig, this.requestTransform);
  }

  return function (body, options) {
    var doThisRequest = doRequest.bind(this, body, options);
    if (process.env.mozuHosted) {
      return doThisRequest();
    } else if (!this.prerequisiteTasks || !Array.isArray(this.prerequisiteTasks)) {
      return Promise.reject(new Error('Could not place request. No `prerequisiteTasks` array found on ' + 'the client object. To require no auth or URL prerequisites, set ' + '`this.prerequisiteTasks = [];` on the client object.'));
    } else {
      return this.prerequisiteTasks.reduce(function (p, t) {
        return p.then(t);
      }, Promise.resolve({
        client: this,
        options: options,
        requestConfig: config
      })).then(doThisRequest);
    }
  };
};
}).call(this,require('_process'))
},{"./request":40,"./tiny-extend":44,"_process":undefined}],38:[function(require,module,exports){
'use strict';

var extend = require('./tiny-extend');

var priorities = {
  'app-claims': ['appClaims'],
  'user-claims': ['userClaims'],
  'tenant': ['tenantId'],
  'site': ['siteId'],
  'master-catalog': ['masterCatalog', 'masterCatalogId'],
  'catalog': ['catalogId'],
  'dataview-mode': ['dataViewMode']
};

var prioritiesKeys = Object.keys(priorities);

module.exports = function (context) {
  var newContext = extend({}, context);
  return prioritiesKeys.reduce(function (ctx, dashKey) {
    return priorities[dashKey].reduce(function (ctx, k) {
      if (k in ctx) {
        ctx[dashKey] = ctx[k];
        delete ctx[k];
      }
      return ctx;
    }, ctx);
  }, newContext);
};
},{"./tiny-extend":44}],39:[function(require,module,exports){
'use strict';

var reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
module.exports = function parseDate(key, value) {
  return typeof value === 'string' && reISO.exec(value) ? new Date(value) : value;
};
},{}],40:[function(require,module,exports){
(function (process,Buffer){
'use strict';
/* global Promise */

var constants = require('../constants');
var extend = require('./tiny-extend');
var url = require('url');
var protocolHandlers = {
  'http:': require('http'),
  'https:': require('https')
};
var streamToCallback = require('./stream-to-callback');
var parseJsonDates = require('./parse-json-dates');
var errorify = require('./errorify');

var USER_AGENT = 'Mozu Node SDK v' + constants.version + ' (Node.js ' + process.version + '; ' + process.platform + ' ' + process.arch + ')';

/**
 * Handle headers
 */
function makeHeaders(conf, payload) {
  var headers;
  function iterateHeaders(memo, key) {
    if (conf.context[constants.headers[key]]) {
      memo[constants.headerPrefix + constants.headers[key]] = conf.context[constants.headers[key]];
    }
    return memo;
  }
  if (conf.scope && conf.scope & constants.scopes.NONE) {
    headers = {};
  } else if (conf.scope && conf.scope & constants.scopes.APP_ONLY) {
    headers = ['APPCLAIMS'].reduce(iterateHeaders, {});
  } else {
    headers = Object.keys(constants.headers).reduce(iterateHeaders, {});
  }

  if (payload) {
    headers['Content-Length'] = payload.length.toString();
  }


  return extend({
    'Accept': 'application/json',
    'Connection': 'close',
    'Content-Type' : 'application/json; charset=utf-8',
    'User-Agent': USER_AGENT
  }, headers, conf.headers || {});
}



/**
 * Make an HTTP request to the Mozu API. This method populates headers based on the scope of the supplied context.
 * @param  {Object} options The request options, to be passed to the `request` module. Look up on NPM for details.
 * @return {Promise<ApiResponse,ApiError>}         A Promise that will fulfill as the JSON response from the API, or reject with an error as JSON from the API.
 */

module.exports = function (options, transform) {
  var conf = extend({}, options);
  conf.method = (conf.method || 'get').toUpperCase();
  var payload;
  if (conf.body) {
    payload = conf.body;
    if (typeof payload !== "string" && !Buffer.isBuffer(payload)) {
      payload = JSON.stringify(payload);
    }
    if ( typeof payload === "string"){
      payload = new Buffer(payload);
    }
  }
  conf.headers = makeHeaders(conf, payload);
  var uri = url.parse(conf.url);
  var protocolHandler = protocolHandlers[uri.protocol];
  if (!protocolHandler) {
    throw new Error('Protocol ' + uri.protocol + ' not supported.');
  }

  return new Promise(function (resolve, reject) {
    var requestOptions = extend(options, {
      hostname: uri.hostname,
      port: uri.port || (uri.protocol === 'https:' ? 443 : 80),
      method: conf.method,
      path: uri.path,
      headers: conf.headers,
      agent: conf.agent
    });
    if (typeof transform === "function") {
      requestOptions = transform(requestOptions);
    }
    var complete = false;
    var request = protocolHandler.request(requestOptions, function (response) {
      streamToCallback(response, function (err, body) {
        complete = true;
        if (err) return reject(errorify(err, extend({ statusCode: response.statusCode, url: response.req.path}, response.headers)));
        if (body) {
          try {
            body = JSON.parse(body, conf.parseDates !== false && parseJsonDates);
          } catch (e) {
            return reject(new Error('Response was not valid JSON: ' + e.message + '\n\n-----\n' + body));
          }
        }
        if (response && response.statusCode >= 400 && response.statusCode < 600) {
          return reject(errorify(body || response, extend({ statusCode: response.statusCode, url: (response.req ? response.req.path : "")}, response.headers)));
        }
        return resolve(body);
      });
    });
    var timeout = options.timeout || 20000;
    request.setTimeout(timeout, function () {
      if (!complete) {
        request.abort();
        reject(errorify("Timeout occurred: request to " + conf.url + " took more than " + timeout / 1000 + " seconds to complete."));
      }
    });
    request.on('error', function (err) {
      reject(errorify(err, request));
    });
    if (payload) request.write(payload);
    request.end();
  });
};

}).call(this,require('_process'),require("buffer").Buffer)
},{"../constants":23,"./errorify":34,"./parse-json-dates":39,"./stream-to-callback":41,"./tiny-extend":44,"_process":undefined,"buffer":undefined,"http":undefined,"https":undefined,"url":undefined}],41:[function(require,module,exports){
'use strict';

module.exports = function streamToCallback(stream, cb) {
  var buf = '';
  stream.setEncoding('utf8');
  stream.on('data', function (chunk) {
    buf += chunk;
  });
  stream.on('error', cb);
  stream.on('end', function () {
    cb(null, buf);
  });
};
},{}],42:[function(require,module,exports){
'use strict';

var util = require('util'),
    extend = require('./tiny-extend');

/**
 * Subclass a constructor. Like Node's `util.inherits` but lets you pass additions to the prototype, and composes constructors.
 * @param  {Function} cons  The constructor to subclass.
 * @param  {Object} proto Methods to add to the prototype.
 * @return {Function}       The new subclass.
 */
module.exports = function sub(cons, proto) {
    var child = function child() {
        cons.apply(this, arguments);
    };
    util.inherits(child, cons);
    if (proto) extend(child.prototype, proto);
    return child;
};
},{"./tiny-extend":44,"util":undefined}],43:[function(require,module,exports){
'use strict';

var TenantClient = undefined;
var TenantsOrPromisesById = {};

module.exports = {
  add: function add(tenant) {
    TenantsOrPromisesById[tenant.id] = tenant;
  },
  get: function get(tenantId, client, scope) {
    TenantClient = TenantClient || require('../clients/platform/tenant');
    var tenant = TenantsOrPromisesById[tenantId];
    if (tenant) {
      // may not be a promise if it was set en masse by AuthProvider.
      // AuthProvider may set hundreds of tenants at once, so we let it
      // set them directly for performance reasons.
      if (typeof tenant.then !== "function") {
        // and turn them into promises as needed.
        tenant = TenantsOrPromisesById[tenantId] = Promise.resolve(tenant);
      }
      return tenant;
    } else {
      return TenantsOrPromisesById[tenantId] = new TenantClient(client).getTenant(null, { scope: scope });
    }
  }
};
},{"../clients/platform/tenant":22}],44:[function(require,module,exports){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

module.exports = function extend(target) {
  return Array.prototype.slice.call(arguments, 1).reduce(function (out, next) {
    if (next && (typeof next === "undefined" ? "undefined" : _typeof(next)) === "object") {
      Object.keys(next).forEach(function (k) {
        out[k] = next[k];
      });
    }
    return out;
  }, target);
};
},{}],45:[function(require,module,exports){
(function (process){
'use strict';

var path = require('path');
var fs = require('fs');

module.exports = function findup(filename) {
  var maybeFile = path.resolve(filename),
      dir = process.cwd(),
      last,
      exists;
  while (!(exists = fs.existsSync(maybeFile)) && dir !== last) {
    maybeFile = path.resolve(dir, '..', filename);
    last = dir;
    dir = path.resolve(dir, '..');
  }
  return exists && maybeFile;
};
}).call(this,require('_process'))
},{"_process":undefined,"fs":undefined,"path":undefined}],46:[function(require,module,exports){
'use strict';

module.exports = {
  current: "1.19.15315.0"
};
},{}],47:[function(require,module,exports){
module.exports = function pctEncode(regexp) {
  regexp = regexp || /\W/g;
  return function encode(string) {
    string = String(string);
    return string.replace(regexp, function (m) {
      var c = m[0].charCodeAt(0)
        , encoded = [];
      if (c < 128) {
        encoded.push(c);
      } else if ((128 <= c && c < 2048)) {
        encoded.push((c >> 6) | 192);
        encoded.push((c & 63) | 128);
      } else {
        encoded.push((c >> 12) | 224);
        encoded.push(((c >> 6) & 63) | 128);
        encoded.push((c & 63) | 128);
      }
      return encoded.map(function (c) {
        return '%' + c.toString(16).toUpperCase();
      }).join('');
    })
  }
}

},{}],48:[function(require,module,exports){
(function (process){
'use strict';

if (!process.version ||
    process.version.indexOf('v0.') === 0 ||
    process.version.indexOf('v1.') === 0 && process.version.indexOf('v1.8.') !== 0) {
  module.exports = nextTick;
} else {
  module.exports = process.nextTick;
}

function nextTick(fn, arg1, arg2, arg3) {
  if (typeof fn !== 'function') {
    throw new TypeError('"callback" argument must be a function');
  }
  var len = arguments.length;
  var args, i;
  switch (len) {
  case 0:
  case 1:
    return process.nextTick(fn);
  case 2:
    return process.nextTick(function afterTickOne() {
      fn.call(null, arg1);
    });
  case 3:
    return process.nextTick(function afterTickTwo() {
      fn.call(null, arg1, arg2);
    });
  case 4:
    return process.nextTick(function afterTickThree() {
      fn.call(null, arg1, arg2, arg3);
    });
  default:
    args = new Array(len - 1);
    i = 0;
    while (i < args.length) {
      args[i++] = arguments[i];
    }
    return process.nextTick(function afterTick() {
      fn.apply(null, args);
    });
  }
}

}).call(this,require('_process'))
},{"_process":undefined}],49:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

// StringDecoder provides an interface for efficiently splitting a series of
// buffers into a series of JS strings without breaking apart multi-byte
// characters. CESU-8 is handled as part of the UTF-8 encoding.
//
// @TODO Handling all encodings inside a single object makes it very difficult
// to reason about this code, so it should be split up in the future.
// @TODO There should be a utf8-strict encoding that rejects invalid UTF-8 code
// points as used by CESU-8.
var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  // Enough space to store all bytes of a single character. UTF-8 needs 4
  // bytes, but CESU-8 may require up to 6 (3 bytes per surrogate).
  this.charBuffer = new Buffer(6);
  // Number of bytes received for the current incomplete multi-byte character.
  this.charReceived = 0;
  // Number of bytes expected for the current incomplete multi-byte character.
  this.charLength = 0;
};


// write decodes the given buffer and returns it as JS string that is
// guaranteed to not contain any partial multi-byte characters. Any partial
// character found at the end of the buffer is buffered up, and will be
// returned when calling write again with the remaining bytes.
//
// Note: Converting a Buffer containing an orphan surrogate to a String
// currently works, but converting a String to a Buffer (via `new Buffer`, or
// Buffer#write) will replace incomplete surrogates with the unicode
// replacement character. See https://codereview.chromium.org/121173009/ .
StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var available = (buffer.length >= this.charLength - this.charReceived) ?
        this.charLength - this.charReceived :
        buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, 0, available);
    this.charReceived += available;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // remove bytes belonging to the current character from the buffer
    buffer = buffer.slice(available, buffer.length);

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (buffer.length === 0) {
      return charStr;
    }
    break;
  }

  // determine and set charLength / charReceived
  this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - this.charReceived, end);
    end -= this.charReceived;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // CESU-8: lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    buffer.copy(this.charBuffer, 0, 0, size);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

// detectIncompleteChar determines if there is an incomplete UTF-8 character at
// the end of the given buffer. If so, it sets this.charLength to the byte
// length that character, and sets this.charReceived to the number of bytes
// that are available for this character.
StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }
  this.charReceived = i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 2;
  this.charLength = this.charReceived ? 2 : 0;
}

function base64DetectIncompleteChar(buffer) {
  this.charReceived = buffer.length % 3;
  this.charLength = this.charReceived ? 3 : 0;
}

},{"buffer":undefined}],50:[function(require,module,exports){
module.exports = (function(){
  /*
   * Generated by PEG.js 0.7.0.
   *
   * http://pegjs.majda.cz/
   */
  
  function quote(s) {
    /*
     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
     * string literal except for the closing quote character, backslash,
     * carriage return, line separator, paragraph separator, and line feed.
     * Any character may appear in the form of an escape sequence.
     *
     * For portability, we also escape escape all control and non-ASCII
     * characters. Note that "\0" and "\v" escape sequences are not used
     * because JSHint does not like the first and IE the second.
     */
     return '"' + s
      .replace(/\\/g, '\\\\')  // backslash
      .replace(/"/g, '\\"')    // closing quote character
      .replace(/\x08/g, '\\b') // backspace
      .replace(/\t/g, '\\t')   // horizontal tab
      .replace(/\n/g, '\\n')   // line feed
      .replace(/\f/g, '\\f')   // form feed
      .replace(/\r/g, '\\r')   // carriage return
      .replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)
      + '"';
  }
  
  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successfull,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
     */
    parse: function(input, startRule) {
      var parseFunctions = {
        "uriTemplate": parse_uriTemplate,
        "expression": parse_expression,
        "op": parse_op,
        "pathExpression": parse_pathExpression,
        "paramList": parse_paramList,
        "param": parse_param,
        "cut": parse_cut,
        "listMarker": parse_listMarker,
        "substr": parse_substr,
        "nonexpression": parse_nonexpression,
        "extension": parse_extension
      };
      
      if (startRule !== undefined) {
        if (parseFunctions[startRule] === undefined) {
          throw new Error("Invalid rule name: " + quote(startRule) + ".");
        }
      } else {
        startRule = "uriTemplate";
      }
      
      var pos = 0;
      var reportFailures = 0;
      var rightmostFailuresPos = 0;
      var rightmostFailuresExpected = [];
      
      function padLeft(input, padding, length) {
        var result = input;
        
        var padLength = length - input.length;
        for (var i = 0; i < padLength; i++) {
          result = padding + result;
        }
        
        return result;
      }
      
      function escape(ch) {
        var charCode = ch.charCodeAt(0);
        var escapeChar;
        var length;
        
        if (charCode <= 0xFF) {
          escapeChar = 'x';
          length = 2;
        } else {
          escapeChar = 'u';
          length = 4;
        }
        
        return '\\' + escapeChar + padLeft(charCode.toString(16).toUpperCase(), '0', length);
      }
      
      function matchFailed(failure) {
        if (pos < rightmostFailuresPos) {
          return;
        }
        
        if (pos > rightmostFailuresPos) {
          rightmostFailuresPos = pos;
          rightmostFailuresExpected = [];
        }
        
        rightmostFailuresExpected.push(failure);
      }
      
      function parse_uriTemplate() {
        var result0, result1;
        var pos0;
        
        pos0 = pos;
        result0 = [];
        result1 = parse_nonexpression();
        if (result1 === null) {
          result1 = parse_expression();
        }
        while (result1 !== null) {
          result0.push(result1);
          result1 = parse_nonexpression();
          if (result1 === null) {
            result1 = parse_expression();
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, pieces) { return new Template(pieces) })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_expression() {
        var result0, result1, result2, result3;
        var pos0, pos1;
        
        pos0 = pos;
        pos1 = pos;
        if (input.charCodeAt(pos) === 123) {
          result0 = "{";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        if (result0 !== null) {
          result1 = parse_op();
          if (result1 !== null) {
            result2 = parse_paramList();
            if (result2 !== null) {
              if (input.charCodeAt(pos) === 125) {
                result3 = "}";
                pos++;
              } else {
                result3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"}\"");
                }
              }
              if (result3 !== null) {
                result0 = [result0, result1, result2, result3];
              } else {
                result0 = null;
                pos = pos1;
              }
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, op, params) { return expression(op, params) })(pos0, result0[1], result0[2]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_op() {
        var result0;
        
        if (/^[\/;:.?&+#]/.test(input.charAt(pos))) {
          result0 = input.charAt(pos);
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\/;:.?&+#]");
          }
        }
        if (result0 === null) {
          result0 = "";
        }
        return result0;
      }
      
      function parse_pathExpression() {
        var result0;
        
        if (input.substr(pos, 2) === "{/") {
          result0 = "{/";
          pos += 2;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"{/\"");
          }
        }
        return result0;
      }
      
      function parse_paramList() {
        var result0, result1, result2, result3;
        var pos0, pos1, pos2, pos3;
        
        pos0 = pos;
        pos1 = pos;
        result0 = parse_param();
        if (result0 !== null) {
          result1 = [];
          pos2 = pos;
          pos3 = pos;
          if (input.charCodeAt(pos) === 44) {
            result2 = ",";
            pos++;
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("\",\"");
            }
          }
          if (result2 !== null) {
            result3 = parse_param();
            if (result3 !== null) {
              result2 = [result2, result3];
            } else {
              result2 = null;
              pos = pos3;
            }
          } else {
            result2 = null;
            pos = pos3;
          }
          if (result2 !== null) {
            result2 = (function(offset, p) { return p; })(pos2, result2[1]);
          }
          if (result2 === null) {
            pos = pos2;
          }
          while (result2 !== null) {
            result1.push(result2);
            pos2 = pos;
            pos3 = pos;
            if (input.charCodeAt(pos) === 44) {
              result2 = ",";
              pos++;
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\",\"");
              }
            }
            if (result2 !== null) {
              result3 = parse_param();
              if (result3 !== null) {
                result2 = [result2, result3];
              } else {
                result2 = null;
                pos = pos3;
              }
            } else {
              result2 = null;
              pos = pos3;
            }
            if (result2 !== null) {
              result2 = (function(offset, p) { return p; })(pos2, result2[1]);
            }
            if (result2 === null) {
              pos = pos2;
            }
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, hd, rst) { rst.unshift(hd); return rst; })(pos0, result0[0], result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_param() {
        var result0, result1, result2;
        var pos0, pos1;
        
        pos0 = pos;
        pos1 = pos;
        result0 = [];
        if (/^[a-zA-Z0-9_.%]/.test(input.charAt(pos))) {
          result1 = input.charAt(pos);
          pos++;
        } else {
          result1 = null;
          if (reportFailures === 0) {
            matchFailed("[a-zA-Z0-9_.%]");
          }
        }
        while (result1 !== null) {
          result0.push(result1);
          if (/^[a-zA-Z0-9_.%]/.test(input.charAt(pos))) {
            result1 = input.charAt(pos);
            pos++;
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("[a-zA-Z0-9_.%]");
            }
          }
        }
        if (result0 !== null) {
          result1 = parse_cut();
          if (result1 === null) {
            result1 = parse_listMarker();
          }
          result1 = result1 !== null ? result1 : "";
          if (result1 !== null) {
            result2 = parse_extension();
            result2 = result2 !== null ? result2 : "";
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, chars, clm, e) { clm = clm || {};
              return {
              name: chars.join(''),
              explode: clm.listMarker,
              cut: clm.cut,
              extended: e
            } })(pos0, result0[0], result0[1], result0[2]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_cut() {
        var result0;
        var pos0;
        
        pos0 = pos;
        result0 = parse_substr();
        if (result0 !== null) {
          result0 = (function(offset, cut) { return {cut: cut}; })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_listMarker() {
        var result0;
        var pos0;
        
        pos0 = pos;
        if (input.charCodeAt(pos) === 42) {
          result0 = "*";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"*\"");
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, listMarker) { return {listMarker: listMarker}; })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_substr() {
        var result0, result1, result2;
        var pos0, pos1;
        
        pos0 = pos;
        pos1 = pos;
        if (input.charCodeAt(pos) === 58) {
          result0 = ":";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\":\"");
          }
        }
        if (result0 !== null) {
          if (/^[0-9]/.test(input.charAt(pos))) {
            result2 = input.charAt(pos);
            pos++;
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("[0-9]");
            }
          }
          if (result2 !== null) {
            result1 = [];
            while (result2 !== null) {
              result1.push(result2);
              if (/^[0-9]/.test(input.charAt(pos))) {
                result2 = input.charAt(pos);
                pos++;
              } else {
                result2 = null;
                if (reportFailures === 0) {
                  matchFailed("[0-9]");
                }
              }
            }
          } else {
            result1 = null;
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, digits) { return parseInt(digits.join('')) })(pos0, result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_nonexpression() {
        var result0, result1;
        var pos0;
        
        pos0 = pos;
        if (/^[^{]/.test(input.charAt(pos))) {
          result1 = input.charAt(pos);
          pos++;
        } else {
          result1 = null;
          if (reportFailures === 0) {
            matchFailed("[^{]");
          }
        }
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            if (/^[^{]/.test(input.charAt(pos))) {
              result1 = input.charAt(pos);
              pos++;
            } else {
              result1 = null;
              if (reportFailures === 0) {
                matchFailed("[^{]");
              }
            }
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, chars) { return chars.join(''); })(pos0, result0);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      function parse_extension() {
        var result0, result1, result2;
        var pos0, pos1;
        
        pos0 = pos;
        pos1 = pos;
        if (input.charCodeAt(pos) === 40) {
          result0 = "(";
          pos++;
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"(\"");
          }
        }
        if (result0 !== null) {
          if (/^[^)]/.test(input.charAt(pos))) {
            result2 = input.charAt(pos);
            pos++;
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("[^)]");
            }
          }
          if (result2 !== null) {
            result1 = [];
            while (result2 !== null) {
              result1.push(result2);
              if (/^[^)]/.test(input.charAt(pos))) {
                result2 = input.charAt(pos);
                pos++;
              } else {
                result2 = null;
                if (reportFailures === 0) {
                  matchFailed("[^)]");
                }
              }
            }
          } else {
            result1 = null;
          }
          if (result1 !== null) {
            if (input.charCodeAt(pos) === 41) {
              result2 = ")";
              pos++;
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\")\"");
              }
            }
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = pos1;
            }
          } else {
            result0 = null;
            pos = pos1;
          }
        } else {
          result0 = null;
          pos = pos1;
        }
        if (result0 !== null) {
          result0 = (function(offset, chars) { return chars.join('') })(pos0, result0[1]);
        }
        if (result0 === null) {
          pos = pos0;
        }
        return result0;
      }
      
      
      function cleanupExpected(expected) {
        expected.sort();
        
        var lastExpected = null;
        var cleanExpected = [];
        for (var i = 0; i < expected.length; i++) {
          if (expected[i] !== lastExpected) {
            cleanExpected.push(expected[i]);
            lastExpected = expected[i];
          }
        }
        return cleanExpected;
      }
      
      function computeErrorPosition() {
        /*
         * The first idea was to use |String.split| to break the input up to the
         * error position along newlines and derive the line and column from
         * there. However IE's |split| implementation is so broken that it was
         * enough to prevent it.
         */
        
        var line = 1;
        var column = 1;
        var seenCR = false;
        
        for (var i = 0; i < Math.max(pos, rightmostFailuresPos); i++) {
          var ch = input.charAt(i);
          if (ch === "\n") {
            if (!seenCR) { line++; }
            column = 1;
            seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            line++;
            column = 1;
            seenCR = true;
          } else {
            column++;
            seenCR = false;
          }
        }
        
        return { line: line, column: column };
      }
      
      
          var cls = require('./lib/classes')
          var Template = cls.Template
          var expression = cls.expression
      
      
      var result = parseFunctions[startRule]();
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos === input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos < input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos === 0|
       *   - |rightmostFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos !== input.length) {
        var offset = Math.max(pos, rightmostFailuresPos);
        var found = offset < input.length ? input.charAt(offset) : null;
        var errorPosition = computeErrorPosition();
        
        throw new this.SyntaxError(
          cleanupExpected(rightmostFailuresExpected),
          found,
          offset,
          errorPosition.line,
          errorPosition.column
        );
      }
      
      return result;
    },
    
    /* Returns the parser source code. */
    toSource: function() { return this._source; }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(expected, found, offset, line, column) {
    function buildMessage(expected, found) {
      var expectedHumanized, foundHumanized;
      
      switch (expected.length) {
        case 0:
          expectedHumanized = "end of input";
          break;
        case 1:
          expectedHumanized = expected[0];
          break;
        default:
          expectedHumanized = expected.slice(0, expected.length - 1).join(", ")
            + " or "
            + expected[expected.length - 1];
      }
      
      foundHumanized = found ? quote(found) : "end of input";
      
      return "Expected " + expectedHumanized + " but " + foundHumanized + " found.";
    }
    
    this.name = "SyntaxError";
    this.expected = expected;
    this.found = found;
    this.message = buildMessage(expected, found);
    this.offset = offset;
    this.line = line;
    this.column = column;
  };
  
  result.SyntaxError.prototype = Error.prototype;
  
  return result;
})();

},{"./lib/classes":51}],51:[function(require,module,exports){
// Generated by CoffeeScript 1.6.3
(function() {
  var FormContinuationExpression, FormStartExpression, FragmentExpression, LabelExpression, NamedExpression, PathParamExpression, PathSegmentExpression, ReservedExpression, SimpleExpression, Template, encoders, _ref, _ref1, _ref2, _ref3, _ref4, _ref5, _ref6, _ref7,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  encoders = require('./encoders');

  Template = Template = (function() {
    function Template(pieces) {
      /*
      :param pieces: An array of strings and expressions in the order they appear in the template.
      */

      var i,
        _this = this;
      this.expressions = [];
      this.prefix = 'string' === typeof pieces[0] ? pieces.shift() : '';
      i = 0;
      pieces.forEach(function(p) {
        switch (typeof p) {
          case 'object':
            return _this.expressions[i++] = p;
          case 'string':
            return _this.expressions[i - 1].suffix = p;
        }
      });
    }

    Template.prototype.expand = function(vars) {
      return this.prefix + this.expressions.map(function(expr) {
        return expr.expand(vars);
      }).join('');
    };

    Template.prototype.toString = function() {
      return this.prefix + this.expressions.join('');
    };

    Template.prototype.toJSON = function() {
      return this.toString();
    };

    return Template;

  })();

  SimpleExpression = (function() {
    var definedPairs;

    SimpleExpression.prototype.first = "";

    SimpleExpression.prototype.sep = ",";

    SimpleExpression.prototype.named = false;

    SimpleExpression.prototype.empty = "";

    SimpleExpression.prototype.allow = "U";

    function SimpleExpression(params) {
      this.params = params;
      this.explodeObject = __bind(this.explodeObject, this);
      this.explodeArray = __bind(this.explodeArray, this);
      this._expandPair = __bind(this._expandPair, this);
      this.stringifySingle = __bind(this.stringifySingle, this);
      this.encode = __bind(this.encode, this);
      if (this.params == null) {
        this.params = [];
      }
      this.suffix = '';
    }

    SimpleExpression.prototype.encode = function(string) {
      /*
      Encode a string value for the URI
      */

      return encoders[this.allow](string);
    };

    SimpleExpression.prototype.stringifySingle = function(param, value) {
      /*
      Encode a single value as a string
      */

      var k, type, v;
      type = typeof value;
      if (type === 'string' || type === 'boolean' || type === 'number') {
        value = value.toString();
        return this.encode(value.substring(0, param.cut || value.length));
      } else if (Array.isArray(value)) {
        if (param.cut) {
          throw new Error("Prefixed Values do not support lists. Check " + param.name);
        }
        return value.map(this.encode).join(',');
      } else {
        if (param.cut) {
          throw new Error("Prefixed Values do not support maps. Check " + param.name);
        }
        return ((function() {
          var _results;
          _results = [];
          for (k in value) {
            v = value[k];
            _results.push([k, v].map(this.encode).join(','));
          }
          return _results;
        }).call(this)).join(',');
      }
    };

    SimpleExpression.prototype.expand = function(vars) {
      var defined, expanded,
        _this = this;
      defined = definedPairs(this.params, vars);
      expanded = defined.map(function(pair) {
        return _this._expandPair.apply(_this, pair);
      }).join(this.sep);
      if (expanded) {
        return this.first + expanded + this.suffix;
      } else {
        if (this.empty && defined.length) {
          return this.empty + this.suffix;
        } else {
          return this.suffix;
        }
      }
    };

    definedPairs = function(params, vars) {
      /*
      Return an array of [key, value] arrays where ``key`` is a parameter name
      from ``@params`` and ``value`` is the value from vars, when ``value`` is
      neither undefined nor an empty collection.
      */

      var _this = this;
      return params.map(function(p) {
        return [p, vars[p.name]];
      }).filter(function(pair) {
        var k, v, vv;
        v = pair[1];
        switch (typeof v) {
          case "undefined":
            return false;
          case "object":
            if (Array.isArray(v)) {
              v.length > 0;
            }
            for (k in v) {
              vv = v[k];
              if (vv) {
                return true;
              }
            }
            return false;
          default:
            return true;
        }
      });
    };

    SimpleExpression.prototype._expandPair = function(param, value) {
      /*
      Return the expanded string form of ``pair``.
      
      :param pair: A ``[param, value]`` tuple.
      */

      var name;
      name = param.name;
      if (param.explode) {
        if (Array.isArray(value)) {
          return this.explodeArray(param, value);
        } else if (typeof value === 'string') {
          return this.stringifySingle(param, value);
        } else {
          return this.explodeObject(value);
        }
      } else {
        return this.stringifySingle(param, value);
      }
    };

    SimpleExpression.prototype.explodeArray = function(param, array) {
      return array.map(this.encode).join(this.sep);
    };

    SimpleExpression.prototype.explodeObject = function(object) {
      var k, pairs, v, vv, _i, _len;
      pairs = [];
      for (k in object) {
        v = object[k];
        k = this.encode(k);
        if (Array.isArray(v)) {
          for (_i = 0, _len = v.length; _i < _len; _i++) {
            vv = v[_i];
            pairs.push([k, this.encode(vv)]);
          }
        } else {
          pairs.push([k, this.encode(v)]);
        }
      }
      return pairs.map(function(pair) {
        return pair.join('=');
      }).join(this.sep);
    };

    SimpleExpression.prototype.toString = function() {
      var params;
      params = this.params.map(function(p) {
        return p.name + p.explode;
      }).join(',');
      return "{" + this.first + params + "}" + this.suffix;
    };

    SimpleExpression.prototype.toJSON = function() {
      return this.toString();
    };

    return SimpleExpression;

  })();

  NamedExpression = (function(_super) {
    __extends(NamedExpression, _super);

    function NamedExpression() {
      this.explodeArray = __bind(this.explodeArray, this);
      this.stringifySingle = __bind(this.stringifySingle, this);
      _ref = NamedExpression.__super__.constructor.apply(this, arguments);
      return _ref;
    }

    /*
    A NamedExpression uses name=value expansions in most cases
    */


    NamedExpression.prototype.stringifySingle = function(param, value) {
      value = (value = NamedExpression.__super__.stringifySingle.apply(this, arguments)) ? "=" + value : this.empty;
      return "" + param.name + value;
    };

    NamedExpression.prototype.explodeArray = function(param, array) {
      var _this = this;
      return array.map(function(v) {
        return "" + param.name + "=" + (_this.encode(v));
      }).join(this.sep);
    };

    return NamedExpression;

  })(SimpleExpression);

  ReservedExpression = (function(_super) {
    __extends(ReservedExpression, _super);

    function ReservedExpression() {
      _ref1 = ReservedExpression.__super__.constructor.apply(this, arguments);
      return _ref1;
    }

    ReservedExpression.prototype.encode = function(string) {
      return encoders['U+R'](string);
    };

    ReservedExpression.prototype.toString = function() {
      return '{+' + (ReservedExpression.__super__.toString.apply(this, arguments)).substring(1);
    };

    return ReservedExpression;

  })(SimpleExpression);

  FragmentExpression = (function(_super) {
    __extends(FragmentExpression, _super);

    function FragmentExpression() {
      _ref2 = FragmentExpression.__super__.constructor.apply(this, arguments);
      return _ref2;
    }

    FragmentExpression.prototype.first = '#';

    FragmentExpression.prototype.empty = '#';

    FragmentExpression.prototype.encode = function(string) {
      return encoders['U+R'](string);
    };

    return FragmentExpression;

  })(SimpleExpression);

  LabelExpression = (function(_super) {
    __extends(LabelExpression, _super);

    function LabelExpression() {
      _ref3 = LabelExpression.__super__.constructor.apply(this, arguments);
      return _ref3;
    }

    LabelExpression.prototype.first = '.';

    LabelExpression.prototype.sep = '.';

    LabelExpression.prototype.empty = '.';

    return LabelExpression;

  })(SimpleExpression);

  PathSegmentExpression = (function(_super) {
    __extends(PathSegmentExpression, _super);

    function PathSegmentExpression() {
      _ref4 = PathSegmentExpression.__super__.constructor.apply(this, arguments);
      return _ref4;
    }

    PathSegmentExpression.prototype.first = '/';

    PathSegmentExpression.prototype.sep = '/';

    return PathSegmentExpression;

  })(SimpleExpression);

  PathParamExpression = (function(_super) {
    __extends(PathParamExpression, _super);

    function PathParamExpression() {
      _ref5 = PathParamExpression.__super__.constructor.apply(this, arguments);
      return _ref5;
    }

    PathParamExpression.prototype.first = ';';

    PathParamExpression.prototype.sep = ';';

    return PathParamExpression;

  })(NamedExpression);

  FormStartExpression = (function(_super) {
    __extends(FormStartExpression, _super);

    function FormStartExpression() {
      _ref6 = FormStartExpression.__super__.constructor.apply(this, arguments);
      return _ref6;
    }

    FormStartExpression.prototype.first = '?';

    FormStartExpression.prototype.sep = '&';

    FormStartExpression.prototype.empty = '=';

    return FormStartExpression;

  })(NamedExpression);

  FormContinuationExpression = (function(_super) {
    __extends(FormContinuationExpression, _super);

    function FormContinuationExpression() {
      _ref7 = FormContinuationExpression.__super__.constructor.apply(this, arguments);
      return _ref7;
    }

    FormContinuationExpression.prototype.first = '&';

    return FormContinuationExpression;

  })(FormStartExpression);

  module.exports = {
    Template: Template,
    SimpleExpression: SimpleExpression,
    NamedExpression: NamedExpression,
    ReservedExpression: ReservedExpression,
    FragmentExpression: FragmentExpression,
    LabelExpression: LabelExpression,
    PathSegmentExpression: PathSegmentExpression,
    PathParamExpression: PathParamExpression,
    FormStartExpression: FormStartExpression,
    FormContinuationExpression: FormContinuationExpression,
    expression: function(op, params) {
      var cls;
      cls = (function() {
        switch (op) {
          case '':
            return SimpleExpression;
          case '+':
            return ReservedExpression;
          case '#':
            return FragmentExpression;
          case '.':
            return LabelExpression;
          case '/':
            return PathSegmentExpression;
          case ';':
            return PathParamExpression;
          case '?':
            return FormStartExpression;
          case '&':
            return FormContinuationExpression;
        }
      })();
      return new cls(params);
    }
  };

}).call(this);

},{"./encoders":52}],52:[function(require,module,exports){
// Generated by CoffeeScript 1.6.3
(function() {
  var pctEncode;

  pctEncode = require('pct-encode');

  exports["U"] = pctEncode(/[^\w~.-]/g);

  exports["U+R"] = pctEncode(/[^\w.~:\/\?#\[\]@!\$&'()*+,;=-]/g);

}).call(this);

},{"pct-encode":47}],53:[function(require,module,exports){

/**
 * For Node.js, simply re-export the core `util.deprecate` function.
 */

module.exports = require('util').deprecate;

},{"util":undefined}]},{},[5])(5)
});