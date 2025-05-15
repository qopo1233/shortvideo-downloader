const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { BrowserPool } = require('./browserPool');

class DouyinDownloader {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     */
    constructor(options = {}) {
        // 创建浏览器池
        this.browserPool = new BrowserPool({
            maxPoolSize: options.maxPoolSize || 5,
            maxQueueSize: options.maxQueueSize || 100,
            browserTimeout: options.browserTimeout || 300000 // 5分钟
        });
        
        // 启动定期清理任务
        this.browserPool.startCleanupTask();
        
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 5000; // 5秒
        this.dynamicsDomainV3 = [
            "https://v3-default.365yg.com",
            "https://v3-xgwap.ixigua.com",
            "https://v3-dy.ixigua.com"
        ],
        this.dynamicsDomainV26 = [
            "https://v26-default.365yg.com",
            "https://v26-xgwap.ixigua.com",
            "https://v26-dy.ixigua.com",
        ];
        
        console.log('DouyinDownloader initialized with browser pool');
    }

    /**
     * 初始化方法 - 为了保持向后兼容
     * @returns {Promise<void>}
     */
    async init() {
        // 浏览器池已在构造函数中初始化
        console.log('DouyinDownloader init called - browser pool already initialized');
        return Promise.resolve();
    }

    /**
     * 等待验证码验证完成
     * @param {Object} page - Puppeteer页面实例
     * @returns {Promise<boolean>} - 是否需要并完成了验证
     */
    async waitForVerification(page) {
        try {
            // 等待验证码弹窗出现
            const verificationSelector = '.captcha_verify_container';
            await page.waitForSelector(verificationSelector, { timeout: 5000 });
            
            console.log('Verification required. Please complete the verification manually.');
            
            // 等待验证完成
            await page.waitForFunction(
                () => !document.querySelector('.captcha_verify_container'),
                { timeout: 300000 } // 5分钟超时
            );
            
            console.log('Verification completed');
            return true;
        } catch (error) {
            console.log('No verification required or verification timed out');
            return false;
        }
    }

    /**
     * 获取视频信息
     * @param {string} videoUrl - 抖音视频URL
     * @returns {Promise<Object>} - 视频信息对象
     */
    async getVideoInfo(videoUrl) {
        let browserInstance = null;
        
        try {
            // 从浏览器池获取一个浏览器实例
            console.log('Getting browser instance from pool...');
            browserInstance = await this.browserPool.getBrowser();
            const page = browserInstance.page;
            
            console.log(`Using browser instance ID: ${browserInstance.id}`);
            console.log('Navigating to video page...');
            
            await page.goto(videoUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            // 检查并处理登录弹窗
            try {
                const loginPanelSelector = '[id^="login-full-panel"]';
                await page.waitForSelector(loginPanelSelector, { timeout: 500 });
                console.log('Login panel detected, removing it...');
                
                // 删除登录弹窗
                await page.evaluate((selector) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        element.remove();
                    }
                }, loginPanelSelector);
                
                console.log('Login panel removed');
            } catch (error) {
                console.log('No login panel found');
            }

            // 打印页面信息
            console.log('Printing page content for debugging...');
            const pageContent = await page.evaluate(() => document.body.innerText);
            console.log('Page content:', pageContent);
            
            console.log
            // 等待视频容器加载
            await page.waitForSelector('.xg-video-container', { timeout: 5000 });
            console.log('Video container loaded');

            // 获取视频ID
            const videoId = await page.evaluate(() => {
                const url = window.location.href;
                const match = url.match(/video\/(\d+)/);
                return match ? match[1] : null;
            });

            if (!videoId) {
                throw new Error('无法获取视频ID');
            }

            console.log('Video ID:', videoId);

            // 获取视频信息
            console.log('Fetching video information...');
            const videoInfo = await page.evaluate(async (aweme_id) => {
                try {
                    console.log('Making API request...');
                    const response = await fetch(
                        `https://www.douyin.com/aweme/v1/web/aweme/detail?aid=6383&version_code=190500&aweme_id=${aweme_id}`,
                        {
                            method: 'GET',
                            headers: {
                                'Referer': 'https://www.douyin.com'
                            }
                        }
                    );
                    console.log('API response status:', response.status);
                    const data = await response.json();
                    console.log('API response data:', data);
                    
                    if (data.status_code !== 0) {
                        throw new Error('获取视频信息失败');
                    }
                    const aweme_detail = data.aweme_detail;
                    const video = aweme_detail.video;
                    const play_addr = video.play_addr;
                    const cover = video.dynamic_cover;
                    let video_url = play_addr.url_list[0];
                    return {
                        title: aweme_detail.desc || '未命名视频',
                        videoUrl: video_url,
                        duration: video.duration,
                        author: aweme_detail.author.nickname,
                        coverUrl: cover.url_list[0],
                        dataSize: play_addr.data_size
                    };
                } catch (error) {
                    console.error('Error in page evaluation:', error);
                    throw error;
                }
            }, videoId);

            if (!videoInfo.videoUrl) {
                throw new Error('无法获取视频URL');
            }
            
            // 判断是v3还是v26
            let dynamicsDomain = this.dynamicsDomainV26;
            if (videoInfo.videoUrl.includes('https://v3')) {
                dynamicsDomain = this.dynamicsDomainV3;
            }
            
            // 从dynamicsDomain 中随机选择一个域名，替换掉 videoInfo.videoUrl 中的域名
            const randomDomain = dynamicsDomain[Math.floor(Math.random() * dynamicsDomain.length)];
            videoInfo.videoUrl = videoInfo.videoUrl.replace(/(https?:\/\/[^\/]+)/, randomDomain);

            // 计算视频的大小，字节数转成MB
            videoInfo.dataSizeMB = (videoInfo.dataSize / 1024 / 1024).toFixed(2) + 'MB';
            console.log('Video Info:', videoInfo);
            videoInfo.videoId = videoId;
            
            // 保存 cookies
            await this.browserPool.saveCookies(browserInstance.id);

            return videoInfo;
        } catch (error) {
            console.error('Error getting video info:', error);
            throw error;
        } finally {
            // 释放浏览器实例回到池中
            if (browserInstance) {
                console.log(`Releasing browser instance ID: ${browserInstance.id} back to pool`);
                this.browserPool.releaseBrowser(browserInstance.id);
            }
        }
    }

    /**
            }
        }
    }

    /**
     * 下载封面图片
     * @param {string} url - 图片URL
     * @param {string} filename - 文件名（不含扩展名）
     * @returns {Promise<string>} - 返回下载图片的路径
     */
    async downloadCoverImage(url, filename) {
        let retries = 0;
        let browserInstance = null;
        
        while (true) {
            try {
                console.log(`Downloading cover image: ${url}`);
                
                // 创建下载目录
                const downloadDir = path.join(__dirname, '../downloads/covers');
                if (!fs.existsSync(downloadDir)) {
                    fs.mkdirSync(downloadDir, { recursive: true });
                }
                
                // 处理文件名，移除非法字符
                const sanitizedFilename = filename.replace(/[\\/:*?"<>|]/g, '_');
                const targetPath = path.join(downloadDir, `${sanitizedFilename}_cover.jpg`);
                
                // 检查文件是否已存在
                if (fs.existsSync(targetPath)) {
                    console.log(`Cover image already exists: ${targetPath}`);
                    return targetPath;
                }

                // 从浏览器池获取一个浏览器实例来获取cookies
                if (!browserInstance) {
                    browserInstance = await this.browserPool.getBrowser();
                    console.log(`Using browser instance ID: ${browserInstance.id} for cover download`);
                }

                // 获取图片URL的cookies
                const cookies = await browserInstance.page.cookies(url);
                const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

                // 使用axios下载图片
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream',
                    headers: {
                        'Cookie': cookieString,
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.douyin.com/'
                    }
                });

                // 创建写入流
                const writer = fs.createWriteStream(targetPath);

                // 监听下载进度
                let downloadedBytes = 0;
                const totalBytes = parseInt(response.headers['content-length'], 10);
                
                response.data.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    const progress = (downloadedBytes / totalBytes * 100).toFixed(2);
                    process.stdout.write(`Downloading cover: ${progress}%\r`);
                });

                // 写入文件
                response.data.pipe(writer);

                // 等待下载完成
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                console.log(`\nCover image downloaded successfully: ${targetPath}`);
                return targetPath;
            } catch (error) {
                retries++;
                console.error(`Cover download attempt ${retries} failed:`, error);
                
                if (retries < this.maxRetries) {
                    console.log(`Retrying in ${this.retryDelay/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                } else {
                    throw new Error(`Cover download failed after ${this.maxRetries} attempts: ${error.message}`);
                }
            } finally {
                // 如果有浏览器实例，释放它
                if (browserInstance) {
                    console.log(`Releasing browser instance ID: ${browserInstance.id} back to pool`);
                    this.browserPool.releaseBrowser(browserInstance.id);
                    browserInstance = null;
                }
            }
        }
    }
    /**
     * 下载文件（视频）
     * @param {string} url - 视频文件的URL
     * @param {string} filename - 文件名（不含扩展名）
     * @returns {Promise<string>} - 返回下载文件的路径
     */
    async downloadFile(url, filename) {
        let retries = 0;
        let browserInstance = null;
        
        while (true) {
            try {
                console.log(`Downloading video: ${url}`);
                
                // 创建下载目录
                const downloadDir = path.join(__dirname, '../downloads');
                if (!fs.existsSync(downloadDir)) {
                    fs.mkdirSync(downloadDir, { recursive: true });
                }
                
                // 处理文件名，移除非法字符
                const sanitizedFilename = filename.replace(/[\\/:*?"<>|]/g, '_');
                const targetPath = path.join(downloadDir, `${sanitizedFilename}.mp4`);
                
                // 检查文件是否已存在
                if (fs.existsSync(targetPath)) {
                    console.log(`Video already exists: ${targetPath}`);
                    return targetPath;
                }

                // 从浏览器池获取一个浏览器实例来获取cookies
                if (!browserInstance) {
                    browserInstance = await this.browserPool.getBrowser();
                    console.log(`Using browser instance ID: ${browserInstance.id} for download`);
                }

                // 获取视频URL的cookies
                const cookies = await browserInstance.page.cookies(url);
                const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

                // 使用axios下载视频
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream',
                    headers: {
                        'Cookie': cookieString,
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.douyin.com/'
                    }
                });

                // 创建写入流
                const writer = fs.createWriteStream(targetPath);

                // 监听下载进度
                let downloadedBytes = 0;
                const totalBytes = parseInt(response.headers['content-length'], 10);
                
                response.data.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    const progress = (downloadedBytes / totalBytes * 100).toFixed(2);
                    process.stdout.write(`Downloading: ${progress}%\r`);
                });

                // 写入文件
                response.data.pipe(writer);

                // 等待下载完成
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                console.log(`\nVideo downloaded successfully: ${targetPath}`);
                return targetPath;
            } catch (error) {
                retries++;
                console.error(`Download attempt ${retries} failed:`, error);
                
                if (retries < this.maxRetries) {
                    console.log(`Retrying in ${this.retryDelay/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                } else {
                    throw new Error(`Download failed after ${this.maxRetries} attempts: ${error.message}`);
                }
            } finally {
                // 如果有浏览器实例，释放它
                if (browserInstance) {
                    console.log(`Releasing browser instance ID: ${browserInstance.id} back to pool`);
                    this.browserPool.releaseBrowser(browserInstance.id);
                    browserInstance = null;
                }
            }
        }
    }

    /**
     * 关闭所有浏览器实例
     */
    async close() {
        if (this.browserPool) {
            await this.browserPool.closeAll();
            this.browserPool.stopCleanupTask();
        }
    }
}

/**
 * 导出DouyinDownloader类，供服务端API使用
 */
module.exports = { DouyinDownloader };

// 如果直接运行此文件，则执行示例下载
if (require.main === module) {
    /**
     * 主函数 - 程序入口
     */
    async function main() {
        const downloader = new DouyinDownloader();
        
        try {
            await downloader.init();
            
            // 示例视频URL
            const videoUrl = 'https://www.douyin.com/video/7498656370800086323';
            
            // 获取视频信息
            const videoInfo = await downloader.getVideoInfo(videoUrl);
            console.log('Video Info:', videoInfo);
            
            // 下载视频
            const filename = `${videoInfo.title}`;
            const downloadPath = await downloader.downloadFile(videoInfo.videoUrl, filename);
            console.log('Video download completed:', downloadPath);
            
            // 下载封面图片
            if (videoInfo.coverUrl) {
                const coverPath = await downloader.downloadCoverImage(videoInfo.coverUrl, filename);
                console.log('Cover image download completed:', coverPath);
            } else {
                console.log('No cover image URL available');
            }
            
        } catch (error) {
            console.error('Error:', error);
        } finally {
            await downloader.close();
        }
    }

    // 运行主函数
    main().catch(console.error);
}