const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

/**
 * 浏览器实例池管理器
 * 用于管理多个浏览器实例，支持并发请求处理
 */
class BrowserPool {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {number} options.maxPoolSize - 池中最大浏览器实例数量
     * @param {number} options.maxQueueSize - 最大等待队列长度
     * @param {number} options.browserTimeout - 浏览器实例空闲超时时间(ms)
     */
    constructor(options = {}) {
        this.maxPoolSize = options.maxPoolSize || 5;
        this.maxQueueSize = options.maxQueueSize || 100;
        this.browserTimeout = options.browserTimeout || 300000; // 5分钟
        
        this.pool = []; // 活跃的浏览器实例
        this.queue = []; // 等待队列
        this.cookiesDir = path.join(__dirname, '../cookies');
        
        // 确保cookies目录存在
        if (!fs.existsSync(this.cookiesDir)) {
            fs.mkdirSync(this.cookiesDir, { recursive: true });
        }
        
        console.log(`Browser pool initialized with max size: ${this.maxPoolSize}, max queue: ${this.maxQueueSize}`);
    }
    
    /**
     * 获取一个浏览器实例
     * @returns {Promise<Object>} - 返回浏览器实例和页面
     */
    async getBrowser() {
        // 检查是否有空闲的浏览器实例
        const availableBrowser = this.pool.find(b => !b.inUse);
        
        if (availableBrowser) {
            console.log(`Reusing browser instance ID: ${availableBrowser.id}`);
            availableBrowser.inUse = true;
            availableBrowser.lastUsed = Date.now();
            return availableBrowser;
        }
        
        // 如果池未满，创建新实例
        if (this.pool.length < this.maxPoolSize) {
            const newBrowser = await this._createBrowserInstance();
            this.pool.push(newBrowser);
            console.log(`Created new browser instance ID: ${newBrowser.id}, pool size: ${this.pool.length}`);
            return newBrowser;
        }
        
        // 如果池已满，加入等待队列
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error('Browser pool queue is full, request rejected');
        }
        
        console.log('Browser pool is full, adding request to queue');
        return new Promise((resolve, reject) => {
            const queueItem = { resolve, reject, timestamp: Date.now() };
            this.queue.push(queueItem);
        });
    }
    
    /**
     * 释放浏览器实例
     * @param {string} browserId - 浏览器实例ID
     */
    releaseBrowser(browserId) {
        const index = this.pool.findIndex(b => b.id === browserId);
        
        if (index !== -1) {
            this.pool[index].inUse = false;
            this.pool[index].lastUsed = Date.now();
            console.log(`Released browser instance ID: ${browserId}`);
            
            // 检查是否有等待的请求
            if (this.queue.length > 0) {
                const nextRequest = this.queue.shift();
                console.log('Processing next queued request');
                nextRequest.resolve(this.pool[index]);
            }
        }
    }
    
    /**
     * 创建新的浏览器实例
     * @private
     * @returns {Promise<Object>} - 返回浏览器实例对象
     */
    async _createBrowserInstance() {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const cookiePath = path.join(this.cookiesDir, `cookies_${id}.json`);
        
        // 启动浏览器
        const browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null,
            // 增加协议超时设置
            protocolTimeout: 180000, // 3分钟超时
            timeout: 180000, // 3分钟超时
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1280,900',
                '--start-maximized',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-dev-shm-usage', // 避免内存不足问题
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--enable-unsafe-swiftshader', // 解决WebGL警告
                '--hide-scrollbars',
                '--mute-audio',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-breakpad',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-domain-reliability',
                '--disable-extensions',
                '--disable-features=AudioServiceOutOfProcess',
                '--disable-hang-monitor',
                '--disable-ipc-flooding-protection',
                '--disable-notifications',
                '--disable-offer-store-unmasked-wallet-cards',
                '--disable-popup-blocking',
                '--disable-print-preview',
                '--disable-prompt-on-repost',
                '--disable-speech-api',
                '--disable-sync',
                '--disable-translate',
                '--disable-voice-input',
                '--metrics-recording-only',
                '--no-default-browser-check',
                '--no-first-run',
                '--no-pings',
                '--no-zygote',
                '--password-store=basic',
                '--use-gl=swiftshader',
                '--use-mock-keychain',
                '--force-device-scale-factor=1',
                '--lang=zh-CN,zh'
            ],
            ignoreDefaultArgs: [
                '--enable-automation',
                '--disable-blink-features=AccessibilityObjectModel', // 禁用无障碍模式
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        // 创建新页面
        const page = await browser.newPage();
        
        // 设置视口大小
        await page.setViewport({ width: 1280, height: 800 });
        
        // 设置 User-Agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 注入反检测脚本
        await page.evaluateOnNewDocument(() => {
            // 覆盖 webdriver 属性
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
            // 覆盖 plugins 属性
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            // 覆盖 languages 属性
            Object.defineProperty(navigator, 'languages', {
                get: () => ['zh-CN', 'zh'],
            });
        });
        
        // 尝试加载已保存的 cookies
        try {
            if (fs.existsSync(cookiePath)) {
                const cookiesString = fs.readFileSync(cookiePath, 'utf8');
                const cookies = JSON.parse(cookiesString);
                await page.setCookie(...cookies);
                console.log(`Cookies loaded for browser ID: ${id}`);
            }
        } catch (error) {
            console.error(`Error loading cookies for browser ID: ${id}:`, error);
        }
        
        return {
            id,
            browser,
            page,
            cookiePath,
            inUse: true,
            createdAt: Date.now(),
            lastUsed: Date.now()
        };
    }
    
    /**
     * 保存浏览器实例的cookies
     * @param {string} browserId - 浏览器实例ID
     */
    async saveCookies(browserId) {
        const browserInstance = this.pool.find(b => b.id === browserId);
        
        if (!browserInstance) {
            console.error(`Browser instance ${browserId} not found`);
            return;
        }
        
        try {
            const cookies = await browserInstance.page.cookies();
            fs.writeFileSync(browserInstance.cookiePath, JSON.stringify(cookies, null, 2));
            console.log(`Cookies saved for browser ID: ${browserId}`);
        } catch (error) {
            console.error(`Error saving cookies for browser ID: ${browserId}:`, error);
        }
    }
    
    /**
     * 清理长时间未使用的浏览器实例
     */
    async cleanup() {
        const now = Date.now();
        const toRemove = [];
        
        // 找出超时的浏览器实例
        for (let i = 0; i < this.pool.length; i++) {
            const instance = this.pool[i];
            
            // 只清理未使用的实例
            if (!instance.inUse && (now - instance.lastUsed > this.browserTimeout)) {
                toRemove.push(i);
            }
        }
        
        // 从后往前移除，避免索引变化问题
        for (let i = toRemove.length - 1; i >= 0; i--) {
            const index = toRemove[i];
            const instance = this.pool[index];
            
            console.log(`Closing idle browser instance ID: ${instance.id}`);
            
            try {
                await instance.browser.close();
            } catch (error) {
                console.error(`Error closing browser ID: ${instance.id}:`, error);
            }
            
            this.pool.splice(index, 1);
        }
        
        console.log(`Cleanup completed, removed ${toRemove.length} instances, pool size: ${this.pool.length}`);
        
        // 清理过期的队列请求
        const queueTimeout = 60000; // 1分钟
        const expiredRequests = this.queue.filter(req => now - req.timestamp > queueTimeout);
        
        for (const req of expiredRequests) {
            const index = this.queue.indexOf(req);
            if (index !== -1) {
                this.queue.splice(index, 1);
                req.reject(new Error('Request timed out in queue'));
            }
        }
    }
    
    /**
     * 关闭所有浏览器实例
     */
    async closeAll() {
        console.log(`Closing all browser instances (${this.pool.length})...`);
        
        for (const instance of this.pool) {
            try {
                await instance.browser.close();
                console.log(`Closed browser instance ID: ${instance.id}`);
            } catch (error) {
                console.error(`Error closing browser ID: ${instance.id}:`, error);
            }
        }
        
        this.pool = [];
        
        // 拒绝所有等待的请求
        for (const req of this.queue) {
            req.reject(new Error('Browser pool is shutting down'));
        }
        
        this.queue = [];
        console.log('All browser instances closed');
    }
    
    /**
     * 启动定期清理任务
     * @param {number} interval - 清理间隔时间(ms)
     */
    startCleanupTask(interval = 60000) {
        this.cleanupInterval = setInterval(() => {
            this.cleanup().catch(err => {
                console.error('Error during browser pool cleanup:', err);
            });
        }, interval);
        
        console.log(`Cleanup task started with interval: ${interval}ms`);
    }
    
    /**
     * 停止定期清理任务
     */
    stopCleanupTask() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            console.log('Cleanup task stopped');
        }
    }
}

module.exports = { BrowserPool };
