/*
 * @Author: dong.han
 * @Date: 2022-10-06 16:18:17
 * @LastEditTime: 2022-10-06 23:02:32
 * @Description: 
 */
const { fontNames } = require('./font.js');

const isNumber = n => /^[0-9]+\.?[0-9]*$/.test(n);

const buildParam = query => {
    // 这里统一做了参数格式的验证，并且要严格些且某些必要参数不要给默认值。这是因为从过往遇到的问题看，当渲染出了问题宁愿报错失败，也不要渲染出错误的结果给用户看到！
    const imgUrl = query.backgroundImageUrl || query.bgiUrl; // 背景图
    if (!imgUrl) throw new Error('请指定背景图');
    let layers = []; // 每个渲染图层
    if (query.layers === undefined) { // 老版本参数（只能渲染一个文字片段的版本）
        layers = [query];
    } else if (typeof query.layers === 'string') { // 预览功能访问过来的 query 参数是数组 json 字符串
        layers = JSON.parse(query.layers);
    } else { // query.layers 是个数组，kafka 过来的应该是个数组
        layers = query.layers;
    }
    if (!layers || !layers.length) throw new Error('请指定渲染内容和样式');
    layers = layers.map(info => {
        const coordinate = info.coordinate ? info.coordinate.split(',') : [];
        if (coordinate.length !== 2 || coordinate.some(n => !isNumber(n))) throw new Error('渲染坐标未填或格式有误');

        const formatParam = {
            width: info.width,
            letterSpacing: info.letterSpacing || 'normal',
            lineHeight: info.lineHeight || 'normal',
            textAlign: info.textAlign || 'left',
            color: info.color,
            text: info.text || '',
            fontFamily: info.font || info.family,
            fontSize: info.size || info.fontSize,
            left: coordinate[0] || 0,
            top: coordinate[1] || 0
        };

        if (!fontNames.includes(formatParam.fontFamily)) throw new Error('请指定正确的字体');
        if (!formatParam.color) throw new Error('请指定字体颜色');
        if (formatParam.fontSize === undefined) throw new Error('请指定字号大小');

        return formatParam;
    });
    return {
        imgUrl,
        layers
    };
};

module.exports = {
    isNumber,
    buildParam
};
