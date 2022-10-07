const { createCanvas } = require('canvas');
/**
 * @description: 绘制可排版的文字
 * @param {Object} _ctx 整张图的 canvas 的上下文
 * @param {String} text 要渲染的文本
 * @param {Object} style 样式对象: x|y|width|fontSize|fontFamily|color|letterSpacing|textAlign|lineHeight
 * @return {*}
 */
const drawText = (_ctx, text, style = {}) => {
    const x = parseInt(style.left || 0);
    const y = parseInt(style.top || 0);
    const width = parseInt(style.width || _ctx.canvas.width);
    const fontSize = parseInt(style.fontSize || 20);
    const letterSpacing = mimeToValue(fontSize, style.letterSpacing);
    const lineHeight = mimeToValue(fontSize, style.lineHeight);
    const { fontFamily, textAlign = 'left' } = style;
    const color = style.color || '#ffffff';

    // _ctx.beginPath();
    // _ctx.moveTo(x, y);
    // _ctx.lineTo(x + width, y);
    // _ctx.closePath();
    // _ctx.stroke();

    // if (color === '#000000') color = '#010101'; // todo: 透明色取gif信息  一般透明色都是黑色，如果再写黑字，会出现字闪动的情况，如果遇到写纯黑，则替换成另一种黑色
    // if (color === '#ffffff') color = '#f1f1f1'; // todo: 透明色取gif信息  一般透明色都是黑色，如果再写黑字，会出现字闪动的情况，如果遇到写纯黑，则替换成另一种黑色
    // ctx.fillText(text, x, y);
    let currentX = 0;
    let currentY = 0;

    const lines = [];
    const lineContext = createTextCanvas({ width, fontSize, color, fontFamily });
    lines.push(lineContext);
    for (let i = 0; i < text.length; i++) {
        let lastLine = lines[lines.length - 1];
        let ctx = lastLine.ctx;

        const char = text.charAt(i);
        const charInfo = ctx.measureText(char);
        const charWidth = charInfo.width;

        const itemWidth = charWidth + letterSpacing;
        if (currentX + itemWidth > width && currentX !== 0) { // 当文字宽度大于可渲染区域宽度且非当前行第一个字时，开始换行。
            currentX = 0;
            currentY = 0;

            const lineContext = createTextCanvas({ width, fontSize, color, fontFamily });
            lines.push(lineContext);
            lastLine = lines[lines.length - 1];
            ctx = lastLine.ctx;
        }
        ctx.fillText(char, currentX, currentY + fontSize / 2); // 这里 +fontSize/2 是因为发现node-canvas在fillText的时候，会使文字与baseline有些距离，为了fix这个问题，createTextCanvas中把 textBaseline = "middle"，然后这里 +fontSize/2
        currentX += itemWidth;
        lastLine.textVisibleWidth = Math.max(currentX - letterSpacing, lastLine.textVisibleWidth || 0);
    }
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        let textAreaX = x;
        switch (textAlign) {
        case 'center':
            textAreaX = (width - l.textVisibleWidth) / 2 + x;
            break;
        case 'right':
            textAreaX = width - l.textVisibleWidth + x;
            break;
        };
        _ctx.drawImage(l.canvas, textAreaX, y + (fontSize + lineHeight) * i);
    }
};

const createTextCanvas = function createTextCanvas (style) {
    const { width, fontSize, fontFamily, color } = style;
    // 由于要做文字排版，在做对齐时需要计算文字的整体宽度，所以这里为文字层单独创建一个 textCanvas，再把 textCanvas 画到整张图上
    const textCanvas = createCanvas(width, fontSize * 4);
    const ctx = textCanvas.getContext('2d');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px '${fontFamily}'`;
    return { ctx, canvas: textCanvas };
};

/**
 * @description: 根据字体大小 + 字间距、行间距的枚举类型 判断实际的使用像素
 * @param {*} fontSize 字体大小
 * @param {*} mimeType 字间距、行间距的枚举类型
 * @return {*}
 */
const mimeToValue = function mimeToValue (fontSize, mimeType) {
    switch (mimeType) {
    case 'normal':
        return 0;
    case 'wide':
        return parseInt(fontSize) / 10;
    case 'narrow':
        return -0.5 * parseInt(fontSize) / 10;
    }
    return 0;
};

module.exports = drawText;
