/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:17
 * @LastEditTime: 2022-10-06 21:35:22
 * @Description: 
 */
const drawText = require('./drawText');
const { createCanvas, Image } = require('canvas');

const renderImage = async (param, imageInfo) => {
    const image = new Image();
    image.src = imageInfo.localPath;
    if (!image.complete) {
        throw new Error('image have not load complete');
    }
    const WIDTH = imageInfo.width;
    const HEIGHT = imageInfo.height;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const context = canvas.getContext('2d');

    context.drawImage(image, 0, 0, WIDTH, HEIGHT);

    param.layers.forEach(item => {
        drawText(context, item.text, item);
    });
    return canvas.toBuffer(imageInfo.mimeType, { compressionLevel: 3, filters: canvas.PNG_FILTER_NONE });
};

module.exports = renderImage;
