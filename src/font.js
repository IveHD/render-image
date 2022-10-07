/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:16
 * @LastEditTime: 2022-10-07 22:06:49
 * @Description: 
 */
const fs = require('fs');
const { registerFont } = require('canvas');
const path = require('path');
const resolve = (...p) => path.resolve(__dirname, ...p);

const fontNames = [];
const registe = (fontFamilyDir) => {
    if (!fs.existsSync(fontFamilyDir)) throw new Error(`font family directory does not exists: ${fontFamilyDir}`);
    const result = fs.readdirSync(fontFamilyDir);
    result.forEach(p => {
        if (!/.+\.ttf$/i.test(p)) return;
        const name = p.replace(/\.ttf/i, '');
        if (name) {
            fontNames.push(name);
            registerFont(resolve(fontFamilyDir, p), { family: name });
        }
    });
};
module.exports = {
    fontNames,
    registe
};
