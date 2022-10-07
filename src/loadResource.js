/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:16
 * @LastEditTime: 2022-10-06 22:29:13
 * @Description: 
 */
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const LRU = require('lru-cache');
const { getConfig } = require('./config');
const config = getConfig();
const CACHE_MAX_AGE = 1000 * 60 * 30;
const cache = new LRU({
    max: 100,
    maxAge: CACHE_MAX_AGE,
    dispose: function (k, v) {},
    noDisposeOnSet: true,
    updateAgeOnGet: true
});

const doLoad = (url, targetPath) => new Promise((resolve, reject) => {
    const agent = /https:?/.test(url) ? https : http;
    agent.get(url, res => {
        if (res.statusCode === 200) {
            const dirPath = path.dirname(targetPath);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
            let buf = Buffer.alloc(0);
            res.on('data', chunk => { // 这里要先把流内容拼装在 buffer 对象上，等到 end 时再统一写到硬盘上，避免 fs.existsSync() 的判断你不准确
                buf = Buffer.concat([buf, chunk]);
            });
            res.on('end', () => { // end 了，统一写到硬盘上
                fs.writeFileSync(targetPath, buf);
                resolve(targetPath);
            });
        } else {
            reject(new Error(`status code: ${res.statusCode} when download img`));
        }
    }).on('error', err => {
        reject(err)
    });
});

const downloadToBuffer = async url => {
    const localPath = await download(url);
    return fs.readFileSync(localPath);
};

const TEMP_PATH = config.tempDir;
if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });
const buildLocalPath = url => {
    return path.resolve(TEMP_PATH, path.basename(url));
};

const download = async url => {
    const localPath = buildLocalPath(url);
    if (fs.existsSync(localPath)) { // 已经存在硬盘上
        cache.set(url, localPath);
        return localPath;
    }
    const cacheResult = cache.get(url);
    if (typeof cacheResult === 'string') { // 缓存里存在且值是字符串(本地存储路径，证明已下载完成)，直接返回
        return cacheResult;
    }

    if (cacheResult instanceof Promise) { // 正在下载中
        const res = await cacheResult; // 等待下载完成
        cache.set(url, res);
        return res;
    }

    const downloadPromise = doLoad(url, localPath).then(res => { // 硬盘、缓存都没有，第一次下载这张图片，则去下载，然后返回Promise形式的结果
        cache.set(url, res);
        return res;
    });
    cache.set(url, downloadPromise);
    return downloadPromise;
};
download.downloadToBuffer = downloadToBuffer;
module.exports = download;
