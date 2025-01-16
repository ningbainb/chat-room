const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({
    port: PORT,
    host: '::', // 监听所有 IPv6 地址
    ipv6Only: false // 同时支持 IPv4 和 IPv6
});
let onlineCount = 0;  // 使用简单的计数器

// 心跳检测间隔（毫秒）
const HEARTBEAT_INTERVAL = 30000;

function broadcastOnlineCount() {
    const data = {
        type: 'online_count',
        count: onlineCount
    };

    console.log(`Broadcasting online count: ${onlineCount}`);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

wss.on('connection', function connection(ws) {
    // 增加在线人数
    onlineCount++;
    console.log(`Client connected. Online count: ${onlineCount}`);

    // 广播在线人数
    broadcastOnlineCount();

    // 设置心跳检测
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', function incoming(message) {
        try {
            wss.clients.forEach(client => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message.toString());
                }
            });
        } catch (error) {
            console.error('Error broadcasting message:', error);
        }
    });

    ws.on('close', () => {
        // 减少在线人数
        onlineCount = Math.max(0, onlineCount - 1);
        console.log(`Client disconnected. Online count: ${onlineCount}`);
        broadcastOnlineCount();
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        // 减少在线人数
        onlineCount = Math.max(0, onlineCount - 1);
        ws.terminate();
        broadcastOnlineCount();
    });

    // 初始化心跳状态
    ws.isAlive = true;
});

// 定期清理断开的连接
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            onlineCount = Math.max(0, onlineCount - 1);
            console.log(`Terminating inactive client. Online count: ${onlineCount}`);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });

    // 只在人数变化时广播
    if (onlineCount !== wss.clients.size) {
        onlineCount = wss.clients.size;
        console.log(`Syncing online count: ${onlineCount}`);
        broadcastOnlineCount();
    }
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
    clearInterval(interval);
});

// 监听服务器错误
wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

// 定期同步在线人数
setInterval(() => {
    const actualCount = wss.clients.size;
    if (onlineCount !== actualCount) {
        onlineCount = actualCount;
        console.log(`Syncing online count: ${onlineCount}`);
        broadcastOnlineCount();
    }
}, 5000);

console.log(`WebSocket 服务器运行在端口 ${PORT}`); 