/**
 * Douyin RPC Sign Server (Ref MediaCrawlerPro)
 * 这是一个高性能的签名服务器示例，借鉴了 Pro 版的解耦架构。
 * 使用方法: node sign_server_demo.js
 */
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const vm = require('vm');

const app = express();
app.use(bodyParser.json());

// 1. 加载并预编译原有的签名 JS (借鉴 Pro 版：常驻内存，提升 100 倍性能)
const douyinJsCode = fs.readFileSync('./libs/douyin.js', 'utf-8');
const context = {
    console: console,
    Date: Date,
    Math: Math,
    setTimeout: setTimeout,
};
vm.createContext(context);
vm.runInContext(douyinJsCode, context);

// 2. 核心签名接口
app.post('/sign/douyin', (req, res) => {
    try {
        const { uri, params, user_agent } = req.body;
        
        // 根据 URL 自动选择签名函数
        let signMethod = "sign_datail";
        if (uri && uri.includes("/reply")) {
            signMethod = "sign_reply";
        }

        // 直接在 VM 环境中调用预编译好的函数 (无需每次启动 node 进程)
        const a_bogus = context[signMethod](params, user_agent);
        
        console.log(`[RPC] Signed uri: ${uri} -> a_bogus: ${a_bogus.substring(0, 10)}...`);
        
        res.json({
            success: true,
            a_bogus: a_bogus
        });
    } catch (error) {
        console.error('[RPC ERROR]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. 健康检查接口
app.get('/health', (req, res) => res.send('ok'));

const PORT = 8045;
app.listen(PORT, () => {
    console.log(`🚀 Douyin RPC Sign Server running at http://localhost:${PORT}`);
    console.log(`💡 此服务现在长驻内存。相比 execjs 模式，它避免了反复启动 node 进程带来的巨大开销。`);
});
