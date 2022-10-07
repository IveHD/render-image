/* NeuQuant Neural-Net Quantization Algorithm
 * ------------------------------------------
 *
 * Copyright (c) 1994 Anthony Dekker
 *
 * NEUQUANT Neural-Net quantization algorithm by Anthony Dekker, 1994.
 * See "Kohonen neural networks for optimal colour quantization"
 * in "Network: Computation in Neural Systems" Vol. 5 (1994) pp 351-367.
 * for a discussion of the algorithm.
 * See also  http://members.ozemail.com.au/~dekker/NEUQUANT.HTML
 *
 * Any party obtaining a copy of these files from the author, directly or
 * indirectly, is granted, free of charge, a full and unrestricted irrevocable,
 * world-wide, paid up, royalty-free, nonexclusive right and license to deal
 * in this software and documentation files (the "Software"), including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons who receive
 * copies from any such party to do so, with the only requirement being
 * that this copyright notice remain intact.
 *
 * (JavaScript port 2012 by Johan Nordberg)
 */

const N_CYCLES = 100; // number of learning cycles
const NETSIZE = 256; // number of colors used
const MAX_NET_POS = NETSIZE - 1;

// defs for freq and bias
const NET_BIAS_SHIFT = 4; // bias for colour values
const INIT_BIAS_SHIFT = 16; // bias for fractions
const INIT_BIAS = (1 << INIT_BIAS_SHIFT);
const GAMMA_SHIFT = 10;
// const gamma = (1 << GAMMA_SHIFT)
const BETA_SHIFT = 10;
const BETA = (INIT_BIAS >> BETA_SHIFT); /* BETA = 1/1024 */
const BETA_GAMMA = (INIT_BIAS << (GAMMA_SHIFT - BETA_SHIFT));

// defs for decreasing radius factor
const INIT_RAD = (NETSIZE >> 3); // for 256 cols, radius starts
const RADIUS_BIAS_SHIFT = 6; // at 32.0 biased by 6 bits
const RADIUS_BIAS = (1 << RADIUS_BIAS_SHIFT);
const INIT_RADIUS = (INIT_RAD * RADIUS_BIAS); // and decreases by a
const RADIUS_DEC = 30; // factor of 1/30 each cycle

// defs for decreasing alpha factor
const ALPHA_BIAS_SHIFT = 10; // alpha starts at 1.0
const INIT_ALPHA = (1 << ALPHA_BIAS_SHIFT);
// let alphadec // biased by 10 bits

/* RAD_BIAS and ALPHA_RAD_BIAS used for radpower calculation */
const RAD_BIAS_SHIFT = 8;
const RAD_BIAS = (1 << RAD_BIAS_SHIFT);
const ALPHA_RAD_BIAS_SHIFT = (ALPHA_BIAS_SHIFT + RAD_BIAS_SHIFT);
const ALPHA_RAD_BIAS = (1 << ALPHA_RAD_BIAS_SHIFT);

// four primes near 500 - assume no image has a length so large that it is
// divisible by all four primes
const PRIME1 = 499;
const PRIME2 = 491;
const PRIME3 = 487;
const PRIME4 = 503;
const MINI_PICTURE_BYTES = (3 * PRIME4);

/*
  Constructor: NeuQuant

  Arguments:

  pixels - array of pixels in RGB format
  samplefac - sampling factor 1 to 30 where lower is better quality

  >
  > pixels = [r, g, b, r, g, b, r, g, b, ..]
  >
*/
function NeuQuant (pixels, samplefac) {
    this.pixels = pixels;
    this.samplefac = samplefac;
    this.network = new Array(NETSIZE);

    this.netindex = new Int32Array(256);
    this.bias = new Int32Array(NETSIZE);
    this.freq = new Int32Array(NETSIZE);
    this.radpower = new Int32Array(NETSIZE >> 3);
    this.colorMap = null;
    let i, v;
    for (i = 0; i < NETSIZE; i++) {
        v = (i << (NET_BIAS_SHIFT + 8)) / NETSIZE;
        this.network[i] = new Float64Array([v, v, v, 0]);
        this.freq[i] = INIT_BIAS / NETSIZE;
        this.bias[i] = 0;
    }
    this.indexSearchCache = {};
};

NeuQuant.prototype.unbiasnet = function () {
    for (let i = 0; i < NETSIZE; i++) {
        this.network[i][0] >>= NET_BIAS_SHIFT;
        this.network[i][1] >>= NET_BIAS_SHIFT;
        this.network[i][2] >>= NET_BIAS_SHIFT;
        this.network[i][3] = i; // record color number
    }
};

NeuQuant.prototype.altersingle = function (alpha, i, b, g, r) {
    this.network[i][0] -= (alpha * (this.network[i][0] - b)) / INIT_ALPHA;
    this.network[i][1] -= (alpha * (this.network[i][1] - g)) / INIT_ALPHA;
    this.network[i][2] -= (alpha * (this.network[i][2] - r)) / INIT_ALPHA;
};

NeuQuant.prototype.alterneigh = function (radius, i, b, g, r) {
    const lo = Math.abs(i - radius);
    const hi = Math.min(i + radius, NETSIZE);

    let j = i + 1;
    let k = i - 1;
    let m = 1;

    let p, a;
    while ((j < hi) || (k > lo)) {
        a = this.radpower[m++];

        if (j < hi) {
            p = this.network[j++];
            p[0] -= (a * (p[0] - b)) / ALPHA_RAD_BIAS;
            p[1] -= (a * (p[1] - g)) / ALPHA_RAD_BIAS;
            p[2] -= (a * (p[2] - r)) / ALPHA_RAD_BIAS;
        }

        if (k > lo) {
            p = this.network[k--];
            p[0] -= (a * (p[0] - b)) / ALPHA_RAD_BIAS;
            p[1] -= (a * (p[1] - g)) / ALPHA_RAD_BIAS;
            p[2] -= (a * (p[2] - r)) / ALPHA_RAD_BIAS;
        }
    }
};

NeuQuant.prototype.contest = function (b, g, r) {
    /*
      finds closest neuron (min dist) and updates freq
      finds best neuron (min dist-bias) and returns position
      for frequently chosen neurons, freq[i] is high and bias[i] is negative
      bias[i] = gamma * ((1 / NETSIZE) - freq[i])
    */

    let bestd = ~(1 << 31);
    let bestbiasd = bestd;
    let bestpos = -1;
    let bestbiaspos = bestpos;

    let i, n, dist, biasdist, betafreq;
    for (i = 0; i < NETSIZE; i++) {
        n = this.network[i];

        dist = Math.abs(n[0] - b) + Math.abs(n[1] - g) + Math.abs(n[2] - r);
        if (dist < bestd) {
            bestd = dist;
            bestpos = i;
        }

        biasdist = dist - ((this.bias[i]) >> (INIT_BIAS_SHIFT - NET_BIAS_SHIFT));
        if (biasdist < bestbiasd) {
            bestbiasd = biasdist;
            bestbiaspos = i;
        }

        betafreq = (this.freq[i] >> BETA_SHIFT);
        this.freq[i] -= betafreq;
        this.bias[i] += (betafreq << GAMMA_SHIFT);
    }

    this.freq[bestpos] += BETA;
    this.bias[bestpos] -= BETA_GAMMA;

    return bestbiaspos;
};

NeuQuant.prototype.inxbuild = function () {
    let i; let j; let p; let q; let smallpos; let smallval; let previouscol = 0; let startpos = 0;
    for (i = 0; i < NETSIZE; i++) {
        p = this.network[i];
        smallpos = i;
        smallval = p[1]; // index on g
        // find smallest in i..NETSIZE-1
        for (j = i + 1; j < NETSIZE; j++) {
            q = this.network[j];
            if (q[1] < smallval) { // index on g
                smallpos = j;
                smallval = q[1]; // index on g
            }
        }
        q = this.network[smallpos];
        // swap p (i) and q (smallpos) entries
        if (i !== smallpos) {
            j = q[0]; q[0] = p[0]; p[0] = j;
            j = q[1]; q[1] = p[1]; p[1] = j;
            j = q[2]; q[2] = p[2]; p[2] = j;
            j = q[3]; q[3] = p[3]; p[3] = j;
        }
        // smallval entry is now in position i

        if (smallval !== previouscol) {
            this.netindex[previouscol] = (startpos + i) >> 1;
            for (j = previouscol + 1; j < smallval; j++) { this.netindex[j] = i; }
            previouscol = smallval;
            startpos = i;
        }
    }
    this.netindex[previouscol] = (startpos + MAX_NET_POS) >> 1;
    for (j = previouscol + 1; j < 256; j++) { this.netindex[j] = MAX_NET_POS; } // really 256
};

NeuQuant.prototype.inxsearch = function (b, g, r) {
    const cacheKey = (b << 16) + (g << 8) + r;
    const cacheIndex = this.indexSearchCache[cacheKey];
    if (cacheIndex !== undefined) return cacheIndex;
    let a, p, dist;

    let bestd = 1000; // biggest possible dist is 256*3
    let best = -1;

    let i = this.netindex[g]; // index on g
    let j = i - 1; // start at netindex[g] and work outwards

    while ((i < NETSIZE) || (j >= 0)) {
        if (i < NETSIZE) {
            p = this.network[i];
            dist = p[1] - g; // inx key
            if (dist >= bestd) i = NETSIZE; // stop iter
            else {
                i++;
                if (dist < 0) dist = -dist;
                a = p[0] - b; if (a < 0) a = -a;
                dist += a;
                if (dist < bestd) {
                    a = p[2] - r; if (a < 0) a = -a;
                    dist += a;
                    if (dist < bestd) {
                        bestd = dist;
                        best = p[3];
                    }
                }
            }
        }
        if (j >= 0) {
            p = this.network[j];
            dist = g - p[1]; // inx key - reverse dif
            if (dist >= bestd) j = -1; // stop iter
            else {
                j--;
                if (dist < 0) dist = -dist;
                a = p[0] - b; if (a < 0) a = -a;
                dist += a;
                if (dist < bestd) {
                    a = p[2] - r; if (a < 0) a = -a;
                    dist += a;
                    if (dist < bestd) {
                        bestd = dist;
                        best = p[3];
                    }
                }
            }
        }
    }
    this.indexSearchCache[cacheKey] = best;
    return best;
};

NeuQuant.prototype.learn = function () {
    let i;

    const lengthcount = this.pixels.length;
    const alphadec = 30 + ((this.samplefac - 1) / 3);
    const samplepixels = lengthcount / (3 * this.samplefac);
    let delta = ~~(samplepixels / N_CYCLES);
    let alpha = INIT_ALPHA;
    let radius = INIT_RADIUS;

    let rad = radius >> RADIUS_BIAS_SHIFT;

    if (rad <= 1) rad = 0;
    for (i = 0; i < rad; i++) { this.radpower[i] = alpha * (((rad * rad - i * i) * RAD_BIAS) / (rad * rad)); }

    let step;
    if (lengthcount < MINI_PICTURE_BYTES) {
        this.samplefac = 1;
        step = 3;
    } else if ((lengthcount % PRIME1) !== 0) {
        step = 3 * PRIME1;
    } else if ((lengthcount % PRIME2) !== 0) {
        step = 3 * PRIME2;
    } else if ((lengthcount % PRIME3) !== 0) {
        step = 3 * PRIME3;
    } else {
        step = 3 * PRIME4;
    }

    let b, g, r, j;
    let pix = 0; // current pixel

    i = 0;
    while (i < samplepixels) {
        b = (this.pixels[pix] & 0xff) << NET_BIAS_SHIFT;
        g = (this.pixels[pix + 1] & 0xff) << NET_BIAS_SHIFT;
        r = (this.pixels[pix + 2] & 0xff) << NET_BIAS_SHIFT;

        j = this.contest(b, g, r);

        this.altersingle(alpha, j, b, g, r);
        if (rad !== 0) this.alterneigh(rad, j, b, g, r); // alter neighbours

        pix += step;
        if (pix >= lengthcount) pix -= lengthcount;

        i++;

        if (delta === 0) delta = 1;
        if (i % delta === 0) {
            alpha -= alpha / alphadec;
            radius -= radius / RADIUS_DEC;
            rad = radius >> RADIUS_BIAS_SHIFT;

            if (rad <= 1) rad = 0;
            for (j = 0; j < rad; j++) { this.radpower[j] = alpha * (((rad * rad - j * j) * RAD_BIAS) / (rad * rad)); }
        }
    }
};

NeuQuant.prototype.buildColorMap = function () {
    this.learn();
    this.unbiasnet();
    this.inxbuild();

    const map = new Array(NETSIZE * 3);
    const index = new Array(NETSIZE);

    for (let i = 0; i < NETSIZE; i++) { index[this.network[i][3]] = i; }

    let k = 0;
    for (let l = 0; l < NETSIZE; l++) {
        const j = index[l];
        map[k++] = (this.network[j][0]);
        map[k++] = (this.network[j][1]);
        map[k++] = (this.network[j][2]);
    }
    this.colorMap = map;
    return map;
};

module.exports = NeuQuant;
