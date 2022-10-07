/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:16
 * @LastEditTime: 2022-10-06 23:13:26
 * @Description: 
 */
const { getConfig } = require('./config');
const fs = require('fs');
const path = require('path');
const gif = require('./core/gif');
const gifyParse = require('gify-parse');
const drawGif = require('./drawGif/index');
const config = getConfig();

const LRU = require('lru-cache');
const CACHE_MAX_AGE = 1000 * 60 * 60;
const gifInfoCache = new LRU({
    max: 500,
    maxAge: CACHE_MAX_AGE,
    dispose: function (k, v) {},
    noDisposeOnSet: true,
    updateAgeOnGet: true
});

const main = async (param, imageInfo) => {
    const { localPath } = imageInfo;

    let cache = gifInfoCache.get(localPath);
    if (!cache) {
        const framePath = path.resolve(config.tempDir, path.basename(localPath, path.extname(localPath)));
        const framesLocalPathList = await gif(localPath, framePath);
        const gifInfo = gifyParse.getInfo(fs.readFileSync(localPath));
        cache = { framesLocalPathList, gifInfo };
        if (framesLocalPathList.length !== gifInfo.images.length) {
            throw new Error('图像帧信息与解析出来的帧数不匹配'); // 按理说图像信息和实际解析出来的帧应该是相等的，出现这个错误猜测是因为由于存在多进程运行，不同进程可能同时下载，某个进程只下载了一帧(猜测，未得到验证)
        }
        gifInfoCache.set(localPath, cache);
    }
    return drawGif(param, cache);
};
module.exports = main;
