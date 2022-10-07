/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:54
 * @LastEditTime: 2022-10-06 20:43:56
 * @Description: 
 */
const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const gifsicle = require('gifsicle');

const generateSplitPromise = function generateSplitPromise (gifSrcPath, targetPath) {
    const prefixPath = path.resolve(process.cwd(), targetPath);
    if (!fs.existsSync(prefixPath)) {
        fs.mkdirSync(prefixPath, { recursive: true });
    }
    let list = [];
    try {
        list = fs.readdirSync(prefixPath);
    } catch (err) {
        return Promise.reject(err);
    }
    try {
        if (list && list.length) {
            const pathList = [];
            for (let i = 0; i < list.length; i++) {
                pathList.push(path.resolve(prefixPath, list[i]));
            }
            return Promise.resolve(pathList);
        } else {
            return new Promise((resolve, reject) => {
                cp.execFile(gifsicle, ['--unoptimize', '-w', '-e', gifSrcPath, '-o', path.join(prefixPath, 'frame')], (err, a, b) => {
                    if (err) {
                        // console.log(err);
                    }
                    list = fs.readdirSync(prefixPath);
                    if (list.length === 0) {
                        reject(new Error('split gif failed!'));
                        return;
                    }
                    list.sort();
                    const pathList = [];
                    for (let i = 0; i < list.length; i++) {
                        pathList.push(path.resolve(prefixPath, list[i]));
                    }
                    resolve(pathList);
                });
            });
        }
    } catch (e) {
        return Promise.reject(e);
    }
};

const splitGif = function (gifSrcPath, targetPath) {
    return generateSplitPromise(gifSrcPath, targetPath);
};

module.exports = splitGif;
