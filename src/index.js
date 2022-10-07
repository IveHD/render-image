/*
 * @Author: dong.han
 * @Date: 2022-10-06 20:02:18
 * @LastEditTime: 2022-10-07 22:06:22
 * @Description: 
 */

const render = require('./render');
const { buildParam } = require('./util');
const { setConfig } = require('./config');
const font = require('./font.js');

const DEFAULT_PARAMS = {
    color: '#ffffff',
    fontSize: '20',
    font: 'FZLTDHJW'
};

class RenderImage {
    constructor(config) {
        this.config = config;
        font.registe(config.fontFamilyDir); // 注册字体
        setConfig(config);
    }
    async render(params) {
        try {
            const info = buildParam(Object.assign({}, DEFAULT_PARAMS, params));
            const result = await render(info);
            return result;
        } catch(err) {
            console.error(err);
            return err.message;
        }
    }
}

module.exports = RenderImage;