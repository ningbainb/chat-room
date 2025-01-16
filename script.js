class ChatRoom {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.selectedFiles = new Set();
        this.totalProgress = 0;
        this.currentFileIndex = 0;
        this.toolsVisible = localStorage.getItem('toolsVisible') !== 'false';
        this.messages = JSON.parse(localStorage.getItem('chatMessages') || '[]');
        this.maxStoredMessages = 100;
        this.onlineCount = 0;
        this.init();
    }

    init() {
        this.initializeElements();
        this.attachEventListeners();
        this.connectWebSocket();
    }

    initializeElements() {
        this.messageInput = document.getElementById('messageInput');
        this.sendMessageBtn = document.getElementById('sendMessage');
        this.fileInput = document.getElementById('fileInput');
        this.sendFileBtn = document.getElementById('sendFile');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.connectionStatus = document.getElementById('connection-status');
        this.clearMessagesBtn = document.getElementById('clearMessages');
        this.filePreview = document.getElementById('filePreview');
        this.placeholder = this.messagesContainer.querySelector('.messages-placeholder');
        this.fileList = this.filePreview.querySelector('.file-list');
        this.clearFilesBtn = document.getElementById('clearFiles');
        this.progressBar = this.filePreview.querySelector('.progress-fill');
        this.progressText = this.filePreview.querySelector('.progress-text');
        this.uploadProgress = this.filePreview.querySelector('.upload-progress');
        this.toggleToolsBtn = document.getElementById('toggleTools');
        this.toolsContainer = document.getElementById('toolsContainer');
        this.inputContainer = document.querySelector('.input-container');
        this.onlineCountElement = document.getElementById('onlineCount');
        this.onlineCountContainer = document.querySelector('.online-count');
        
        // 初始化工具栏状态
        this.updateToolsVisibility();

        // 加载保存的消息
        this.loadSavedMessages();
    }

    attachEventListeners() {
        this.sendMessageBtn.addEventListener('click', this.sendMessage.bind(this));
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        this.sendFileBtn.addEventListener('click', this.sendFile.bind(this));
        this.clearMessagesBtn.addEventListener('click', this.clearMessages.bind(this));
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.clearFilesBtn.addEventListener('click', this.clearFileSelection.bind(this));
        this.toggleToolsBtn.addEventListener('click', this.toggleTools.bind(this));
    }

    connectWebSocket() {
        // 自动检测 IPv6 或 IPv4
        const hostname = window.location.hostname;
        const isIPv6 = hostname.includes(':');
        const wsHost = isIPv6 ? `[${hostname}]` : hostname;
        this.ws = new WebSocket(`ws://${wsHost}:8080`);
        this.ws.onopen = this.handleConnection.bind(this);
        this.ws.onclose = this.handleDisconnection.bind(this);
        this.ws.onmessage = this.handleMessage.bind(this);
        this.ws.onerror = this.handleError.bind(this);
    }

    handleError(error) {
        console.error('WebSocket error:', error);
        this.displayMessage('连接错误，请检查网络连接', 'error');
    }

    handleConnection() {
        this.connectionStatus.textContent = '已连接';
        this.connectionStatus.classList.add('connected');
        this.onlineCountContainer.classList.remove('offline');
    }

    handleDisconnection() {
        this.connectionStatus.textContent = '未连接';
        this.connectionStatus.classList.remove('connected');
        this.onlineCountContainer.classList.add('offline');
        this.updateOnlineCount(0);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connectWebSocket(), 3000);
        } else {
            this.displayMessage('无法连接到服务器，请刷新页面重试', 'error');
        }
    }

    handleMessage(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'online_count') {
            this.updateOnlineCount(data.count);
        } else if (data.type === 'message') {
            this.displayMessage(data.content, 'received');
            this.saveMessage({
                type: 'message',
                content: data.content,
                messageType: 'received',
                timestamp: new Date().toISOString()
            });
        } else if (data.type === 'file') {
            this.displayFileMessage(data.filename, data.content, 'received', data.fileType);
            this.saveMessage({
                type: 'file',
                filename: data.filename,
                content: data.content,
                fileType: data.fileType,
                messageType: 'received',
                timestamp: new Date().toISOString()
            });
            this.showDownloadProgress(data.filename);
        }
    }

    showDownloadProgress(filename) {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'download-progress';
        progressDiv.innerHTML = `
            <div class="file-info">
                <span class="file-name">正在下载: ${filename}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <span class="progress-text">0%</span>
        `;
        
        this.messagesContainer.appendChild(progressDiv);
        this.scrollToBottom();

        // 模拟下载进度
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                setTimeout(() => progressDiv.remove(), 1000);
            }
            const progressFill = progressDiv.querySelector('.progress-fill');
            const progressText = progressDiv.querySelector('.progress-text');
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${Math.round(progress)}%`;
        }, 200);
    }

    sendMessage() {
        const message = this.messageInput.value.trim();
        if (message && this.ws.readyState === WebSocket.OPEN) {
            const data = {
                type: 'message',
                content: message
            };
            this.ws.send(JSON.stringify(data));
            this.displayMessage(message, 'sent');
            this.saveMessage({
                type: 'message',
                content: message,
                messageType: 'sent',
                timestamp: new Date().toISOString()
            });
            this.messageInput.value = '';
        }
    }

    async sendFile() {
        if (this.selectedFiles.size === 0 || this.ws.readyState !== WebSocket.OPEN) return;
        
        this.uploadProgress.classList.add('active');
        this.totalProgress = 0;
        this.currentFileIndex = 0;
        const totalFiles = this.selectedFiles.size;

        for (const file of this.selectedFiles) {
            try {
                this.currentFileIndex++;
                await this.sendSingleFile(file, totalFiles);
            } catch (error) {
                console.error('Error sending file:', error);
                this.displayMessage(`文件 ${file.name} 发送失败`, 'error');
            }
        }
        
        this.uploadProgress.classList.remove('active');
        this.clearFileSelection();
    }
    
    sendSingleFile(file, totalFiles) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    const fileProgress = (e.loaded / e.total) * 100;
                    const totalProgress = ((this.currentFileIndex - 1) / totalFiles * 100) + (fileProgress / totalFiles);
                    this.progressBar.style.width = `${totalProgress}%`;
                    this.progressText.textContent = `${Math.round(totalProgress)}%`;
                }
            };

            reader.onload = (e) => {
                const data = {
                    type: 'file',
                    filename: file.name,
                    content: e.target.result,
                    fileType: file.type
                };
                try {
                    this.ws.send(JSON.stringify(data));
                    this.displayFileMessage(file.name, e.target.result, 'sent', file.type);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    displayMessage(message, type, save = true) {
        if (this.placeholder) {
            this.placeholder.remove();
            this.placeholder = null;
        }
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', type);
        
        const timestamp = new Date().toISOString();
        messageElement.innerHTML = `
            <div class="message-content">${message}</div>
            <div class="message-time">${this.formatTimestamp(timestamp)}</div>
        `;
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();

        if (save) {
            this.saveMessage({
                type: 'message',
                content: message,
                messageType: type,
                timestamp: timestamp
            });
        }
    }

    displayFileMessage(filename, content, type, fileType, save = true) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'file-message', type);
        
        const link = document.createElement('a');
        link.href = content;
        link.download = filename;
        link.textContent = `📎 ${filename}`;
        
        messageElement.appendChild(link);
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();

        if (save) {
            this.saveMessage({
                type: 'file',
                filename: filename,
                content: content,
                fileType: fileType,
                messageType: type,
                timestamp: new Date().toISOString()
            });
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    clearMessages() {
        if (confirm('确定要清空所有消息吗？')) {
            this.messagesContainer.innerHTML = '<div class="messages-placeholder">等待消息...</div>';
            this.placeholder = this.messagesContainer.querySelector('.messages-placeholder');
            this.messages = [];
            localStorage.removeItem('chatMessages');
        }
    }

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        this.fileList.innerHTML = '';
        this.selectedFiles.clear();
        
        const sendFileBtn = document.getElementById('sendFile');
        
        files.forEach(file => {
            this.selectedFiles.add(file);
            const fileItem = document.createElement('div');
            fileItem.className = 'file-preview-item';
            
            const icon = this.getFileTypeIcon(file);
            fileItem.innerHTML = `
                <span class="file-type-icon">${icon}</span>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                </div>
                <span class="remove-file" data-name="${file.name}">❌</span>
            `;

            const removeBtn = fileItem.querySelector('.remove-file');
            removeBtn.addEventListener('click', () => {
                this.selectedFiles.delete(file);
                fileItem.remove();
                if (this.selectedFiles.size === 0) {
                    this.filePreview.classList.remove('active');
                    sendFileBtn.classList.remove('visible');
                }
            });

            this.fileList.appendChild(fileItem);
        });
        
        if (this.selectedFiles.size > 0) {
            this.filePreview.classList.add('active');
            sendFileBtn.classList.add('visible');
        } else {
            this.filePreview.classList.remove('active');
            sendFileBtn.classList.remove('visible');
        }
    }

    clearFileSelection() {
        this.selectedFiles.clear();
        this.fileList.innerHTML = '';
        this.filePreview.classList.remove('active');
        this.fileInput.value = '';
        document.getElementById('sendFile').classList.remove('visible');
    }

    getFileTypeIcon(file) {
        if (file.type.startsWith('image/')) return '📷';
        if (file.type.startsWith('video/')) return '📹';
        if (file.type.startsWith('audio/')) return '🎵';
        if (file.type.includes('pdf')) return '📄';
        if (file.type.includes('word') || file.type.includes('document')) return '📝';
        if (file.type.includes('sheet') || file.type.includes('excel')) return '📊';
        return '📎';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    toggleTools() {
        this.toolsVisible = !this.toolsVisible;
        localStorage.setItem('toolsVisible', this.toolsVisible);
        this.updateToolsVisibility();
    }

    updateToolsVisibility() {
        if (this.toolsVisible) {
            this.toolsContainer.classList.remove('hidden');
            this.toggleToolsBtn.classList.add('active');
            this.inputContainer.classList.remove('tools-hidden');
        } else {
            this.toolsContainer.classList.add('hidden');
            this.toggleToolsBtn.classList.remove('active');
            this.inputContainer.classList.add('tools-hidden');
        }
    }

    loadSavedMessages() {
        if (this.messages.length > 0) {
            this.placeholder?.remove();
            this.placeholder = null;
            
            let lastDate = null;
            
            this.messages.forEach(msg => {
                const currentDate = new Date(msg.timestamp).toLocaleDateString();
                if (currentDate !== lastDate) {
                    const dateDiv = document.createElement('div');
                    dateDiv.className = 'date-separator';
                    dateDiv.textContent = this.formatDateSeparator(msg.timestamp);
                    this.messagesContainer.appendChild(dateDiv);
                    lastDate = currentDate;
                }
                
                if (msg.type === 'file') {
                    this.displayFileMessage(msg.filename, msg.content, msg.messageType, msg.fileType, false);
                } else {
                    this.displayMessage(msg.content, msg.messageType, false);
                }
            });
        }
    }

    saveMessage(message) {
        if (this.messages.length >= this.maxStoredMessages) {
            this.messages = this.messages.slice(-this.maxStoredMessages + 1);
        }
        this.messages.push(message);
        localStorage.setItem('chatMessages', JSON.stringify(this.messages));
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else if (date.toDateString() === yesterday.toDateString()) {
            return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            return date.toLocaleDateString('zh-CN', { 
                month: 'numeric', 
                day: 'numeric',
                hour: '2-digit', 
                minute: '2-digit'
            });
        }
    }

    formatDateSeparator(timestamp) {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return '今天';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return '昨天';
        } else {
            return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
        }
    }

    updateOnlineCount(count) {
        if (this.onlineCount !== count) {
            this.onlineCount = count;
            this.onlineCountElement.textContent = count;
            this.onlineCountElement.classList.add('count-update');
            
            // 移除动画类
            setTimeout(() => {
                this.onlineCountElement.classList.remove('count-update');
            }, 300);
        }
    }
}

// 创建聊天室实例
window.addEventListener('load', () => {
    new ChatRoom();
}); 