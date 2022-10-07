const consumerGroup = require('../kafka/index.js');
const render = require('./render');
const { buildParam } = require('./util');

const consumeControl = () => {
    let processingCount = 0;
    const MAX_PROCESSING_COUNT = 5;
    const add = () => {
        processingCount++;
        if (processingCount > MAX_PROCESSING_COUNT) {
            consumerGroup.pause();
        }
    };
    const reduce = () => {
        processingCount--;
        if (processingCount <= MAX_PROCESSING_COUNT) {
            consumerGroup.resume();
        }
    };
    return {
        add,
        reduce
    };
};

const cc = consumeControl();
module.exports = () => {
    consumerGroup.on('message', async msg => {
        cc.add();
        const info = JSON.parse(msg.value);
        if (!info) {
            return;
        }

        let res = {};
        let renderErrorInfo = null;
        try {
            const param = buildParam(info);
            res = await render(param, true);
        } catch (err) {
            renderErrorInfo = err.message;
        }
        cc.reduce();
        const cb_param = {
            id: info.id,
            adId: info.adId,
            planId: info.planId,
            materialId: info.materialId,
            // text: info.text,
            imgUrl: res.url, // 渲染成功图片地址
            result: res.success ? 1 : 0, // 1:渲染成功 0:渲染失败
            renderErrorInfo
        };
        // const cb_res = await AdPlanMaterialTextLoader.remote('drawingResult', cb_param);
        if (!cb_res || !cb_res.success) {
            return;
        }
    });
};
