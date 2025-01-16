const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    // 记录访问日志
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);

    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = path.extname(filePath);
    const contentTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif'
    };

    const contentType = contentTypes[extname] || 'text/plain';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'SAMEORIGIN',
                'X-XSS-Protection': '1; mode=block'
            });
            res.end(content, 'utf-8');
        }
    });
});

const PORT = 3000;
server.listen(PORT, '::', () => { // 监听所有 IPv6 地址
    console.log(`HTTP 服务器运行在端口 ${PORT}`);
    console.log('支持的地址:');
    console.log('- http://[::]:' + PORT);
    console.log('- http://localhost:' + PORT);
    
    // 获取所有网络接口
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // 跳过内部接口
            if (net.internal) continue;
            
            // 显示 IPv6 地址
            if (net.family === 'IPv6') {
                console.log(`网络接口: ${name}`);
                console.log(`IPv6 地址: ${net.address}`);
                console.log(`访问地址: http://[${net.address}]:${PORT}`);
                console.log(`是否临时地址: ${net.temporary ? '是' : '否'}`);
                console.log(`作用域: ${net.scopeid || '全局'}`);
                console.log('-------------------');
            }
        }
    }
}); 