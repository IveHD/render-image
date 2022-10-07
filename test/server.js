/*
 * @Author: dong.han
 * @Date: 2022-10-06 23:16:30
 * @LastEditTime: 2022-10-07 22:08:16
 * @Description: 
 */
const RenderImage = require('../src/index');
const express = require('express');
const app = express();
const port = 5601;
const path = require('path');
const renderImage = new RenderImage({
    fontFamilyDir: path.resolve(__dirname, './font'),
});
app.use(express.static('temp'));


app.use(express.static('temp'));

app.use('/ping/health', (req, res, next) => {
    res.status(200).end('ok');
});

app.get('/renderImage', async (req, res, next) => {
    const info = req.query;
    try {
        const result = await renderImage.render(info);
        res.end(result);
    } catch (err) {
        res.json({
            success: false,
            info: err.message
        });
    }
});

app.use((err, req, res, next) => {
    res.end(err.toString());
});

app.listen(port, () => {
    console.log(`I am listening port: ${port}`);
});
