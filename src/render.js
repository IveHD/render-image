/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:16
 * @LastEditTime: 2022-10-07 22:05:47
 * @Description: 
 */
const getImageInfo = require('imageinfo');
const fs = require('fs');
const renderImage = require('./renderImage');
const renderGif = require('./renderGif');

const download = require('./loadResource');

module.exports = async (param) => {
    try {
        const localPath = await download(param.imgUrl);
        const imageInfo = getImageInfo(fs.readFileSync(localPath));
        imageInfo.localPath = localPath;
        let buffer = null;
        if (imageInfo.format === 'GIF') {
            buffer = await renderGif(param, imageInfo);
        } else {
            buffer = await renderImage(param, imageInfo);
        }
        return buffer;
    } catch (err) {
        // console.error(err);
        throw err;
    }
};
