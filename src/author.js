const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class DouyinDownloader {
    constructor() {
        this.browser = null;
        this.page = null;
        this.cookiePath = path.join(__dirname, '../cookies.json');
        this.maxRetries = 3;
        this.retryDelay = 5000; // 
        this.requestLogs = []; // 存储请求日志

    }

    async init() {
        // 启动浏览器
        this.browser = await puppeteer.launch({
            headless: true,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1280,800',
                '--start-maximized',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        });

        // 创建新页面
        this.page = await this.browser.newPage();

        // 设置视口大小
        await this.page.setViewport({ width: 1280, height: 800 });

        // 设置 User-Agent
        await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 注入反检测脚本
        await this.page.evaluateOnNewDocument(() => {
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

        // 加载已保存的 cookies
        await this.loadCookies();
        // 监控网络请求
        this.page.on('request', async request => {
            const url = request.url();
            if (!url.includes('/aweme/v1/web/aweme/post')) {
                return;
            }
            console.log('url', url);
            // 只记录 JSON 请求
            if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
                try {
                    const requestData = {
                        url: url,
                        method: request.method(),
                        headers: request.headers(),
                        timestamp: new Date().toISOString(),
                        postData: request.postData(),
                    };

                    // 保存请求信息
                    this.requestLogs.push({
                        type: 'request',
                        data: requestData
                    });

                    // 写入日志文件
                    this.saveRequestLogs();

                    console.log('Network Request:', JSON.stringify(requestData, null, 2));
                } catch (error) {
                    console.error('Error logging request:', error);
                }
            }
        });

        // 监控网络响应
        this.page.on('response', async response => {
            const url = response.url();
            if (!url.includes('/aweme/v1/web/aweme/post')) {
                return;
            }
            console.log('url', url);
            // 只记录 JSON 响应
            if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
                try {
                    let responseBody = null;
                    try {
                        responseBody = await response.json();
                    } catch (e) {
                        // 如果不是 JSON 格式，忽略错误
                    }

                    if (responseBody) {
                        const responseData = {
                            url: url,
                            status: response.status(),
                            headers: response.headers(),
                            timestamp: new Date().toISOString(),
                            body: responseBody
                        };

                        // 保存响应信息
                        this.requestLogs.push({
                            type: 'response',
                            data: responseData
                        });

                        // 写入日志文件
                        this.saveRequestLogs();

                        console.log('Network Response:', JSON.stringify(responseData, null, 2));
                    }
                } catch (error) {
                    console.error('Error logging response:', error);
                }
            }
        });
    }

    async loadCookies() {
        try {
            if (fs.existsSync(this.cookiePath)) {
                const cookiesString = fs.readFileSync(this.cookiePath, 'utf8');
                const cookies = JSON.parse(cookiesString);
                await this.page.setCookie(...cookies);
                console.log('Cookies loaded successfully');
            }
        } catch (error) {
            console.error('Error loading cookies:', error);
        }
    }

    async saveCookies() {
        try {
            const cookies = await this.page.cookies();
            fs.writeFileSync(this.cookiePath, JSON.stringify(cookies, null, 2));
            console.log('Cookies saved successfully');
        } catch (error) {
            console.error('Error saving cookies:', error);
        }
    }


    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
    saveRequestLogs() {
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir);
        }
    
        const logFile = path.join(logsDir, `network_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(logFile, JSON.stringify(this.requestLogs, null, 2));
    }


}

// 使用示例
async function main() {
    const downloader = new DouyinDownloader();

    try {
        await downloader.init();

        await downloader.page.goto('https://www.douyin.com/user/MS4wLjABAAAAf_-Gk22IqG3WU1goRr7xD2Ry0YjgfEQI1wfVT8HkO8BAqqQl8QvXhWkf5e_pWP3B');
        await downloader.page.waitForSelector('[data-e2e="user-post-list"]', { timeout: 10000 });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await downloader.close();
    }
}

// 运行主函数
main().catch(console.error); 