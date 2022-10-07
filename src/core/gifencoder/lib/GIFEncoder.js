/*
  GIFEncoder.js

  Authors
  Kevin Weiner (original Java version - kweiner@fmsware.com)
  Thibault Imbert (AS3 version - bytearray.org)
  Johan Nordberg (JS version - code@johan-nordberg.com)
  Eugene Ware (node.js streaming version - eugene@noblesmaurai.com)
*/

const stream = require('stream');
// const NeuQuant = require('./TypedNeuQuant.js');
const MyQuant = require('./MyQuant.js');
const LZWEncoder = require('./LZWEncoder.js');

function ByteArray () {
    this.data = [];
}

ByteArray.prototype.getData = function () {
    // eslint-disable-next-line new-cap
    return new Buffer.from(this.data);
};

ByteArray.prototype.writeByte = function (val) {
    this.data.push(val);
};

ByteArray.prototype.writeUTFBytes = function (string) {
    for (let l = string.length, i = 0; i < l; i++) { this.writeByte(string.charCodeAt(i)); }
};

ByteArray.prototype.writeBytes = function (array, offset, length) {
    for (let l = length || array.length, i = offset || 0; i < l; i++) { this.writeByte(array[i]); }
};

function GIFEncoder (width, height) {
    // image size
    this.width = ~~width;
    this.height = ~~height;

    // transparent color if given
    this.transparent = null;

    // transparent index in color table
    this.transIndex = 0;

    // -1 = no repeat, 0 = forever. anything else is repeat count
    this.repeat = -1;

    // frame delay (hundredths)
    this.delay = 0;

    this.image = null; // current frame
    this.pixels = null; // BGR byte array from frame
    this.indexedPixels = null; // converted frame indexed to palette
    this.colorDepth = null; // number of bit planes
    this.colorTab = null; // RGB palette
    this.usedEntry = []; // active palette entries
    this.palSize = 7; // color table size (bits-1)
    this.dispose = -1; // disposal code (-1 = use default)
    this.firstFrame = true;
    this.sample = 20; // default sample interval for quantizer

    this.started = false; // started encoding

    this.readStreams = [];

    this.out = new ByteArray();
    this.already = null;
    this.closestCache = {};
}

GIFEncoder.prototype.createReadStream = function (rs) {
    if (!rs) {
        rs = new stream.Readable();
        rs._read = function () {};
    }
    this.readStreams.push(rs);
    return rs;
};

GIFEncoder.prototype.createWriteStream = function (options) {
    const self = this;
    if (options) {
        Object.keys(options).forEach(function (option) {
            const fn = 'set' + option[0].toUpperCase() + option.substr(1);
            if (~['setDelay', 'setFrameRate', 'setDispose', 'setRepeat',
                'setTransparent', 'setQuality'].indexOf(fn)) {
                // eslint-disable-next-line no-useless-call
                self[fn].call(self, options[option]);
            }
        });
    }

    const ws = new stream.Duplex({ objectMode: true });
    ws._read = function () {};
    this.createReadStream(ws);

    ws._write = function (data, enc, next) {
        if (!self.started) self.start();
        self.addFrame(data);
        next();
    };
    const end = ws.end;
    ws.end = function () {
        end.apply(ws, [].slice.call(arguments));
        self.finish();
    };
    return ws;
};

GIFEncoder.prototype.emit = function () {
    const self = this;
    if (this.readStreams.length === 0) return;
    if (this.out.data.length) {
        this.readStreams.forEach(function (rs) {
            rs.push(Buffer.from(self.out.data));
        });
        this.out.data = [];
    }
};

GIFEncoder.prototype.end = function () {
    if (this.readStreams.length === null) return;
    this.emit();
    this.readStreams.forEach(function (rs) {
        rs.push(null);
    });
    this.readStreams = [];
};

/*
  Sets the delay time between each frame, or changes it for subsequent frames
  (applies to the next frame added)
*/
GIFEncoder.prototype.setDelay = function (milliseconds) {
    this.delay = Math.round(milliseconds / 10);
};

/*
  Sets frame rate in frames per second.
*/
GIFEncoder.prototype.setFrameRate = function (fps) {
    this.delay = Math.round(100 / fps);
};

/*
  Sets the GIF frame disposal code for the last added frame and any
  subsequent frames.

  Default is 0 if no transparent color has been set, otherwise 2.
*/
GIFEncoder.prototype.setDispose = function (disposalCode) {
    if (disposalCode >= 0) this.dispose = disposalCode;
};

/*
  Sets the number of times the set of GIF frames should be played.

  -1 = play once
  0 = repeat indefinitely

  Default is -1

  Must be invoked before the first image is added
*/

GIFEncoder.prototype.setRepeat = function (repeat) {
    this.repeat = repeat;
};

/*
  Sets the transparent color for the last added frame and any subsequent
  frames. Since all colors are subject to modification in the quantization
  process, the color in the final palette for each frame closest to the given
  color becomes the transparent color for that frame. May be set to null to
  indicate no transparent color.
*/
GIFEncoder.prototype.setTransparent = function (color) {
    this.transparent = color;
};

/*
  Adds next GIF frame. The frame is not written immediately, but is
  actually deferred until the next frame is received so that timing
  data can be inserted.  Invoking finish() flushes all frames.
*/
GIFEncoder.prototype.addFrame = function (imageData) {
    // HTML Canvas 2D Context Passed In
    if (imageData && imageData.getImageData) {
        this.image = imageData.getImageData(0, 0, this.width, this.height).data;
    } else {
        this.image = imageData;
    }
    this.getImagePixels(); // convert to correct format if necessary
    this.analyzePixels(); // build color table & map pixels
    if (this.firstFrame) {
        this.writeLSD(); // logical screen descriptior
        this.writePalette(); // global color table
        if (this.repeat >= 0) {
            // use NS app extension to indicate reps
            this.writeNetscapeExt();
        }
    }

    this.writeGraphicCtrlExt(); // write graphic control extension
    this.writeImageDesc(); // image descriptor
    if (!this.firstFrame) this.writePalette(); // local color table
    this.writePixels(); // encode and write pixel data
    this.firstFrame = false;
    this.emit();
};

/*
  Adds final trailer to the GIF stream, if you don't call the finish method
  the GIF stream will not be valid.
*/
GIFEncoder.prototype.finish = function () {
    this.out.writeByte(0x3b); // gif trailer
    this.end();
};

/*
  Sets quality of color quantization (conversion of images to the maximum 256
  colors allowed by the GIF specification). Lower values (minimum = 1)
  produce better colors, but slow processing significantly. 10 is the
  default, and produces good color mapping at reasonable speeds. Values
  greater than 20 do not yield significant improvements in speed.
*/
GIFEncoder.prototype.setQuality = function (quality) {
    if (quality < 1) quality = 1;
    this.sample = quality;
};

/*
  Writes GIF file header
*/
GIFEncoder.prototype.start = function () {
    this.out.writeUTFBytes('GIF89a');
    this.started = true;
    this.emit();
};

/*
  Analyzes current frame colors and creates color map.
*/
GIFEncoder.prototype.analyzePixels = function () {
    const len = this.pixels.length;
    const nPix = len / 3;

    this.indexedPixels = new Uint8Array(nPix);

    const imgq = this.already || (this.already = new MyQuant(this.pixels, this.sample));
    this.colorTab = imgq.colorMap || imgq.buildColorMap(); // create reduced palette
    // map image pixels to new palette
    let k = 0;
    for (let j = 0; j < nPix; j++) {
        const index = imgq.inxsearch(
            this.pixels[k++] & 0xff,
            this.pixels[k++] & 0xff,
            this.pixels[k++] & 0xff
        );
        this.usedEntry[index] = true;
        this.indexedPixels[j] = index;
        if (this.image[j * 4 + 3] === 0 && this.transparent !== null) {
            this.transIndex = this.findClosest(this.transparent);
            this.indexedPixels[j] = this.transIndex;
        }
    }

    this.pixels = null;
    this.colorDepth = 8;
    this.palSize = 7;
};

GIFEncoder.prototype.concatArray = function (_Constructor, arrays) {
    let totalLength = 0;
    for (const arr of arrays) {
        totalLength += arr.length;
    }
    const result = new _Constructor(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
};

GIFEncoder.prototype.analyzeAllFramesPixels = function (imageDatas) {
    const w = this.width;
    const h = this.height;
    const framePixels = new Uint8Array(w * h * 3 * imageDatas.length);

    this.pixels = new Uint8Array(w * h * 3);

    const data = this.concatArray(Uint8Array, imageDatas);

    let count = 0;

    for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
            const b = (i * w * 4) + j * 4;
            framePixels[count++] = data[b];
            framePixels[count++] = data[b + 1];
            framePixels[count++] = data[b + 2];
            if (this.transparent === null && data[b + 3] === 0) {
                const transparentColor = (data[b] << 16) + (data[b + 1] << 8) + (data[b + 2]);
                this.setTransparent(transparentColor);
            }
        }
    }
    const imgq = this.already || (this.already = new MyQuant(framePixels, this.sample));
    this.colorTab = imgq.colorMap || imgq.buildColorMap(); // create reduced palette
    return framePixels;
};

/*
  Returns index of palette color closest to c
*/
GIFEncoder.prototype.findClosest = function (c) {
    if (this.closestCache[c] !== undefined) return this.closestCache[c];
    if (this.colorTab === null) return -1;

    const r = (c & 0xFF0000) >> 16;
    const g = (c & 0x00FF00) >> 8;
    const b = (c & 0x0000FF);
    let minpos = 0;
    let dmin = 256 * 256 * 256;
    const len = this.colorTab.length;

    for (let i = 0; i < len;) {
        const index = i / 3;
        const dr = r - (this.colorTab[i++] & 0xff);
        const dg = g - (this.colorTab[i++] & 0xff);
        const db = b - (this.colorTab[i++] & 0xff);
        const d = dr * dr + dg * dg + db * db;
        if (d < dmin) { // if (this.usedEntry[index] && (d < dmin)) {
            dmin = d;
            minpos = index;
            if (dmin === 0) break;
        }
    }
    this.closestCache[c] = minpos;
    return minpos;
};

/*
  Extracts image pixels into byte array pixels
  (removes alphachannel from canvas imagedata)
*/
GIFEncoder.prototype.getImagePixels = function () {
    const w = this.width;
    const h = this.height;
    this.pixels = new Uint8Array(w * h * 3);

    const data = this.image;
    let count = 0;

    for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
            const b = (i * w * 4) + j * 4;
            this.pixels[count] = data[b];
            this.pixels[count + 1] = data[b + 1];
            this.pixels[count + 2] = data[b + 2];
            const alpha = data[b + 3];
            // if (alpha !== 255 && alpha !== 0) {
            //     this.pixels[count + 1] = 0xff;
            //     this.pixels[count + 2] = 0xff;
            //     this.pixels[count + 3] = 0xff;
            // }
            count += 3;
            if (this.transparent === null && alpha === 0) {
                const transparentColor = (data[b] << 16) + (data[b + 1] << 8) + (data[b + 2]);
                this.setTransparent(transparentColor);
            }
        }
    }
};

/*
  Writes Graphic Control Extension
*/
GIFEncoder.prototype.writeGraphicCtrlExt = function () {
    this.out.writeByte(0x21); // extension introducer
    this.out.writeByte(0xf9); // GCE label
    this.out.writeByte(4); // data block size

    let transp, disp;
    if (this.transparent === null) {
        transp = 0;
        disp = 0; // dispose = no action
    } else {
        transp = 1;
        disp = 2; // force clear if using transparent color
    }

    if (this.dispose >= 0) {
        disp = this.dispose & 7; // user override
    }
    disp <<= 2;

    // packed fields
    this.out.writeByte(
        0 | // 1:3 reserved
    disp | // 4:6 disposal
    0 | // 7 user input - 0 = none
    transp // 8 transparency flag
    );

    this.writeShort(this.delay); // delay x 1/100 sec
    this.out.writeByte(this.transIndex); // transparent color index
    this.out.writeByte(0); // block terminator
};

/*
  Writes Image Descriptor
*/
GIFEncoder.prototype.writeImageDesc = function () {
    this.out.writeByte(0x2c); // image separator
    this.writeShort(0); // image position x,y = 0,0
    this.writeShort(0);
    this.writeShort(this.width); // image size
    this.writeShort(this.height);

    // packed fields
    if (this.firstFrame) {
    // no LCT - GCT is used for first (or only) frame
        this.out.writeByte(0);
    } else {
    // specify normal LCT
        this.out.writeByte(
            0x80 | // 1 local color table 1=yes
      0 | // 2 interlace - 0=no
      0 | // 3 sorted - 0=no
      0 | // 4-5 reserved
      this.palSize // 6-8 size of color table
        );
    }
};

/*
  Writes Logical Screen Descriptor
*/
GIFEncoder.prototype.writeLSD = function () {
    // logical screen size
    this.writeShort(this.width);
    this.writeShort(this.height);

    // packed fields
    this.out.writeByte(
        0x80 | // 1 : global color table flag = 1 (gct used)
    0x70 | // 2-4 : color resolution = 7
    0x00 | // 5 : gct sort flag = 0
    this.palSize // 6-8 : gct size
    );

    this.out.writeByte(0xff); // background color index
    this.out.writeByte(0); // pixel aspect ratio - assume 1:1
};

/*
  Writes Netscape application extension to define repeat count.
*/
GIFEncoder.prototype.writeNetscapeExt = function () {
    this.out.writeByte(0x21); // extension introducer
    this.out.writeByte(0xff); // app extension label
    this.out.writeByte(11); // block size
    this.out.writeUTFBytes('NETSCAPE2.0'); // app id + auth code
    this.out.writeByte(3); // sub-block size
    this.out.writeByte(1); // loop sub-block id
    this.writeShort(this.repeat); // loop count (extra iterations, 0=repeat forever)
    this.out.writeByte(0); // block terminator
};

/*
  Writes color table
*/
GIFEncoder.prototype.writePalette = function () {
    this.out.writeBytes(this.colorTab);
    const n = (3 * 256) - this.colorTab.length;
    for (let i = 0; i < n; i++) { this.out.writeByte(0); }
};

GIFEncoder.prototype.writeShort = function (pValue) {
    this.out.writeByte(pValue & 0xFF);
    this.out.writeByte((pValue >> 8) & 0xFF);
};

/*
  Encodes and writes pixel data
*/
GIFEncoder.prototype.writePixels = function () {
    const enc = new LZWEncoder(this.width, this.height, this.indexedPixels, this.colorDepth);
    enc.encode(this.out);
};

module.exports = GIFEncoder;
