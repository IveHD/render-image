/*
 * @Author: dong.han
 * @Date: 2022-10-06 22:00:29
 * @LastEditTime: 2022-10-07 21:59:49
 * @Description: 
 */
const path = require('path');
const resolve = (...p) => path.resolve(process.cwd(), ...p);
const config = {
    fontFamilyDir: resolve('./asset/font'),
    tempDir: resolve('./temp'),
    // todo tempDir 清理策略
};

let isConfigSetted = false;
const setConfig = (selfConfig) => {
    if (isConfigSetted) throw new Error('setConfig() can only called once');
    Object.assign(config, selfConfig);
};

const getConfig = () => config;

module.exports = {
    getConfig,
    setConfig,
};