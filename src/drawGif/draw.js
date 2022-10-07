/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:16
 * @LastEditTime: 2022-10-06 19:24:59
 * @Description: 
 */

const { createCanvas, Image } = require('canvas');
const GIFEncoder = require('../core/gifencoder');
const drawText = require('../drawText');
const images = require('images');

module.exports = function (param, _gifInfo) {
    const { framesLocalPathList, gifInfo } = _gifInfo;
    const WIDTH = parseInt(gifInfo.width);
    const HEIGHT = parseInt(gifInfo.height);
    const encoder = new GIFEncoder(WIDTH, HEIGHT);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setQuality(10);
    const frameDatas = [];
    for (let i = 0; i < framesLocalPathList.length; i++) {
        const file = framesLocalPathList[i];
        const canvas = createCanvas(WIDTH, HEIGHT);
        const context = canvas.getContext('2d');
        const img = new Image();
        img.src = images(file).toBuffer('png');
        if (!img.complete) {
            throw new Error('image have not load complete');
        }
        context.drawImage(img, 0, 0, WIDTH, HEIGHT);
        // const fs = require('fs');
        // const path = require('path');
        // const w = fs.createWriteStream(path.resolve(__dirname, `frame-${i}.png`));
        // w.write(canvas.toBuffer());

        param.layers.forEach(item => {
            drawText(context, item.text, item);
        });
        frameDatas.push(context.getImageData(0, 0, WIDTH, HEIGHT).data);
    }

    // encoder.analyzeAllFramesPixels(frameDatas);
    frameDatas.forEach((ctx, i) => {
        encoder.addFrame(ctx);
        encoder.setDelay(gifInfo.images[i].delay);
    });
    encoder.finish();
    return encoder.out.getData();
};
