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
            
            console.log('Verification required. Attempting to solve automatically...');
            
            // 保存验证码截图以便调试
            const debugDir = path.join(__dirname, '../debug');
            if (!fs.existsSync(debugDir)) {
                fs.mkdirSync(debugDir, { recursive: true });
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const screenshotPath = path.join(debugDir, `captcha-${timestamp}.png`);
            await page.screenshot({ path: screenshotPath });
            console.log(`Captcha screenshot saved to: ${screenshotPath}`);
            
            // 尝试自动滑动验证
            try {
                await this.solveSlideCaptcha(page);
                console.log('Automatic captcha solving attempt completed');
            } catch (solveError) {
                console.error('Failed to solve captcha automatically:', solveError);
                console.log('Waiting for manual verification or timeout...');
            }
            
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
     * 尝试自动解决滑动验证码
     * @param {Object} page - Puppeteer页面实例
     * @returns {Promise<void>}
     */
    async solveSlideCaptcha(page) {
        // 等待滑块元素加载
        const sliderSelector = '.secsdk-captcha-drag-icon';
        await page.waitForSelector(sliderSelector, { timeout: 5000 });
        
        // 获取滑块元素
        const sliderHandle = await page.$(sliderSelector);
        if (!sliderHandle) {
            throw new Error('未找到滑块元素');
        }
        
        // 获取滑块位置
        const sliderBox = await sliderHandle.boundingBox();
        
        // 获取滑动轨道元素
        const trackSelector = '.captcha_verify_slide_bar';
        const trackElement = await page.$(trackSelector);
        if (!trackElement) {
            throw new Error('未找到滑动轨道元素');
        }
        
        // 获取轨道宽度
        const trackBox = await trackElement.boundingBox();
        
        // 计算最大滑动距离
        const maxSlideDistance = trackBox.width - sliderBox.width;
        
        // 滑动起始点（滑块中心）
        const startX = sliderBox.x + sliderBox.width / 2;
        const startY = sliderBox.y + sliderBox.height / 2;
        
        // 模拟人类滑动轨迹
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        
        // 生成人类化的滑动轨迹
        const steps = 30; // 滑动步数
        const baseDistance = maxSlideDistance * 0.8; // 估计的滑动距离，稍微小于最大距离
        
        // 模拟人类滑动特征：开始快，中间慢，结束快
        for (let i = 0; i < steps; i++) {
            const progress = i / steps;
            
            // 使用三次贝塞尔曲线模拟人类动作
            // 这会创建一个先快后慢再快的运动模式
            const easeInOutCubic = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            // 添加小幅度的随机性，模拟手部抖动
            const randomOffset = (Math.random() - 0.5) * 2;
            
            const currentDistance = baseDistance * easeInOutCubic;
            const currentX = startX + currentDistance + randomOffset;
            
            // 在Y方向上也添加小幅度的随机性
            const currentY = startY + (Math.random() - 0.5) * 3;
            
            await page.mouse.move(currentX, currentY);
            
            // 添加随机延迟，模拟人类速度变化
            await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
        }
        
        // 最后的微调滑动，尝试几次小幅度调整
        for (let i = 0; i < 3; i++) {
            const finalAdjustment = (Math.random() - 0.5) * 10;
            await page.mouse.move(startX + baseDistance + finalAdjustment, startY + (Math.random() - 0.5) * 2);
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
        }
        
        // 松开鼠标
        await page.mouse.up();
        
        // 等待一段时间，查看验证结果
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 检查验证是否成功
        const isSuccess = await page.evaluate(() => {
            return !document.querySelector('.captcha_verify_container');
        });
        
        if (!isSuccess) {
            // 如果验证失败，再尝试一次不同的距离
            console.log('First captcha solving attempt failed, trying with different distance...');
            
            // 重新获取滑块元素（可能已经刷新）
            const newSliderHandle = await page.$(sliderSelector);
            if (!newSliderHandle) {
                throw new Error('重试时未找到滑块元素');
            }
            
            const newSliderBox = await newSliderHandle.boundingBox();
            const newStartX = newSliderBox.x + newSliderBox.width / 2;
            const newStartY = newSliderBox.y + newSliderBox.height / 2;
            
            // 使用不同的距离再尝试一次
            const newBaseDistance = maxSlideDistance * 0.9; // 尝试更长的距离
            
            await page.mouse.move(newStartX, newStartY);
            await page.mouse.down();
            
            // 简化的第二次尝试
            for (let i = 0; i < steps; i++) {
                const progress = i / steps;
                const easeInOutQuad = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                
                const currentDistance = newBaseDistance * easeInOutQuad;
                await page.mouse.move(newStartX + currentDistance, newStartY + (Math.random() - 0.5) * 2);
                await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 10));
            }
            
            await page.mouse.up();
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
            
            // 添加控制台监控
            page.on('console', msg => {
                const type = msg.type();
                const text = msg.text();
                console.log(`[Browser Console][${type}] ${text}`);
            });
            
            page.on('pageerror', error => {
                console.error('[Browser PageError]', error.message);
            });
            
            page.on('requestfailed', request => {
                console.error('[Browser RequestFailed]', 
                    `URL: ${request.url()}, ` +
                    `Method: ${request.method()}, ` +
                    `Reason: ${request.failure()?.errorText || 'Unknown'}, ` +
                    `ResourceType: ${request.resourceType()}`);
            });
            
            console.log(`Using browser instance ID: ${browserInstance.id}`);
            console.log('Navigating to video page...');
            
            // 使用更长的超时时间和更完整的等待策略
            try {
                await page.goto(videoUrl, {
                    waitUntil: 'networkidle2', // 等待网络基本空闲
                    timeout: 60000 // 60秒超时
                });
            } catch (navigationError) {
                console.error('Navigation error:', navigationError);
                console.log('Attempting to continue despite navigation error...');
                
                // 尝试等待一些时间让页面加载
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            // 在检查验证码之前先保存截图
            try {
                // 创建调试目录
                const debugDir = path.join(__dirname, '../debug');
                if (!fs.existsSync(debugDir)) {
                    fs.mkdirSync(debugDir, { recursive: true });
                }
                
                // 生成时间戳文件名
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const screenshotPath = path.join(debugDir, `before-verification-${timestamp}.png`);
                const htmlPath = path.join(debugDir, `before-verification-${timestamp}.html`);
                
                // 保存截图
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`Before verification screenshot saved to: ${screenshotPath}`);
                
                // 保存页面HTML
                const html = await page.content();
                fs.writeFileSync(htmlPath, html);
                console.log(`Before verification HTML saved to: ${htmlPath}`);
                
                // 保存当前 URL
                const currentUrl = await page.url();
                console.log(`Current URL before verification: ${currentUrl}`);
                fs.writeFileSync(path.join(debugDir, `before-verification-url-${timestamp}.txt`), currentUrl);
            } catch (debugError) {
                console.error('Error saving debug info before verification:', debugError);
            }
            
            // 检查并处理验证码
            const needVerification = await this.waitForVerification(page);
            if (needVerification) {
                console.log('Verification was needed and completed successfully');
            }

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
            try {
                const pageContent = await page.evaluate(() => document.body.innerText);
                console.log('Page content length:', pageContent.length);
                // 只打印前200个字符，避免日志过大
                console.log('Page content preview:', pageContent.substring(0, 200) + '...');
            } catch (error) {
                console.error('Error getting page content:', error);
            }
            
            // 获取当前页面的url
            const currentUrl = await page.url();
            console.log('Current page URL:', currentUrl);

            // 等待视频容器加载 - 尝试多个可能的选择器
            let videoContainerFound = false;
            const possibleSelectors = [
                '.xg-video-container',
                '.video-container',
                '.swiper-container',
                '.player-container',
                '.video-player',
                'video',
                '.xgplayer',
                '.xg-player',
                '.swiper-slide-active'
            ];
            
            for (const selector of possibleSelectors) {
                try {
                    console.log(`Trying to find selector: ${selector}`);
                    // 使用更长的超时时间
                    await page.waitForSelector(selector, { timeout: 15000 });
                    console.log(`Found video container with selector: ${selector}`);
                    videoContainerFound = true;
                    break;
                } catch (error) {
                    console.log(`Selector ${selector} not found`);
                }
            }
            
            if (!videoContainerFound) {
                console.log('No video container found with any known selector, proceeding anyway...');
                
                // 保存截图和HTML以便调试
                try {
                    // 创建调试目录
                    const debugDir = path.join(__dirname, '../debug');
                    if (!fs.existsSync(debugDir)) {
                        fs.mkdirSync(debugDir, { recursive: true });
                    }
                    
                    // 生成时间戳文件名
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const screenshotPath = path.join(debugDir, `no-container-${timestamp}.png`);
                    const htmlPath = path.join(debugDir, `no-container-${timestamp}.html`);
                    
                    // 保存截图
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    console.log(`Screenshot saved to: ${screenshotPath}`);
                    
                    // 保存页面HTML
                    const html = await page.content();
                    fs.writeFileSync(htmlPath, html);
                    console.log(`HTML saved to: ${htmlPath}`);
                } catch (debugError) {
                    console.error('Error saving debug info:', debugError);
                }
                
                // 等待额外时间让页面加载
                console.log('Waiting additional time for page to load...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }

            

            // 获取视频ID
            let videoId;
            try {
                videoId = await page.evaluate(() => {
                    const url = window.location.href;
                    console.log('Current URL for ID extraction:', url);
                    const match = url.match(/video\/(\d+)/);
                    if (!match) {
                        console.error('No video ID found in URL');
                        return null;
                    }
                    return match[1];
                });
                
                if (!videoId) {
                    // 尝试其他方法获取视频ID
                    console.log('Trying alternative method to get video ID...');
                    
                    // 保存当前页面截图和HTML
                    const debugDir = path.join(__dirname, '../debug');
                    if (!fs.existsSync(debugDir)) {
                        fs.mkdirSync(debugDir, { recursive: true });
                    }
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const screenshotPath = path.join(debugDir, `no-id-${timestamp}.png`);
                    const htmlPath = path.join(debugDir, `no-id-${timestamp}.html`);
                    
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    console.log(`Screenshot saved to: ${screenshotPath}`);
                    
                    const html = await page.content();
                    fs.writeFileSync(htmlPath, html);
                    console.log(`HTML saved to: ${htmlPath}`);
                    
                    throw new Error('无法获取视频ID');
                }
            } catch (error) {
                console.error('Error getting video ID:', error);
                throw error;
            }

            console.log('Video ID:', videoId);

            // 获取视频信息
            console.log('Fetching video information...');
            let videoInfo;
            try {
                // 使用设置更长超时的方式调用页面函数
                videoInfo = await page.evaluate(async (aweme_id) => {
                    try {
                        console.log('Making API request...');
                        // 打印当前页面的cookie信息
                        const cookieStr = document.cookie;
                        console.log('Document cookies length:', cookieStr.length);
                        console.log('Document cookies preview:', cookieStr.substring(0, 100) + '...');
                        
                        // 使用随机参数避免缓存
                        const timestamp = new Date().getTime();
                        const random = Math.floor(Math.random() * 1000000);
                        const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail?aid=6383&version_code=190500&aweme_id=${aweme_id}&_t=${timestamp}&_r=${random}`;
                        console.log('API URL:', apiUrl);
                        
                        // 设置超时控制
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
                        
                        let response;
                        try {
                            response = await fetch(
                                apiUrl,
                                {
                                    method: 'GET',
                                    headers: {
                                        'Referer': 'https://www.douyin.com',
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                        'Accept': 'application/json, text/plain, */*',
                                        'Accept-Language': 'zh-CN,zh;q=0.9',
                                        'Cache-Control': 'no-cache',
                                        'Pragma': 'no-cache'
                                    },
                                    signal: controller.signal
                                }
                            );
                            
                            // 清除超时定时器
                            clearTimeout(timeoutId);
                            console.log('API response status:', response.status);
                        } catch (fetchError) {
                            console.error('Fetch error:', fetchError);
                            throw new Error(`API 请求失败: ${fetchError.message}`);
                        }
                        
                        if (!response.ok) {
                            console.error('API response not OK:', response.status, response.statusText);
                            const responseText = await response.text();
                            console.log('Response text:', responseText);
                            throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
                        }
                        
                        const data = await response.json();
                        console.log('API response data available');
                        
                        if (data.status_code !== 0) {
                            console.error('API error status code:', data.status_code, data.status_msg);
                            throw new Error(`获取视频信息失败: ${data.status_msg || '未知错误'}`);
                        }
                        
                        if (!data.aweme_detail) {
                            console.error('No aweme_detail in response:', data);
                            throw new Error('响应中缺少aweme_detail数据');
                        }
                        
                        const aweme_detail = data.aweme_detail;
                        
                        if (!aweme_detail.video) {
                            console.error('No video data in aweme_detail:', aweme_detail);
                            throw new Error('响应中缺少video数据');
                        }
                        
                        const video = aweme_detail.video;
                        
                        if (!video.play_addr || !video.play_addr.url_list || video.play_addr.url_list.length === 0) {
                            console.error('No play_addr or url_list in video data:', video);
                            throw new Error('响应中缺少视频URL');
                        }
                        
                        const play_addr = video.play_addr;
                        const cover = video.dynamic_cover || video.origin_cover || {};
                        let video_url = play_addr.url_list[0];
                        
                        return {
                            title: aweme_detail.desc || '未命名视频',
                            videoUrl: video_url,
                            duration: video.duration,
                            author: aweme_detail.author ? aweme_detail.author.nickname : '未知作者',
                            coverUrl: cover.url_list ? cover.url_list[0] : null,
                            dataSize: play_addr.data_size
                        };
                    } catch (error) {
                        console.error('Error in page evaluation:', error);
                        throw error;
                    }
                }, videoId);
            } catch (error) {
                console.error('Error evaluating in page context:', error);
                
                // 保存页面状态以便调试
                try {
                    const debugDir = path.join(__dirname, '../debug');
                    if (!fs.existsSync(debugDir)) {
                        fs.mkdirSync(debugDir, { recursive: true });
                    }
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const screenshotPath = path.join(debugDir, `api-error-${timestamp}.png`);
                    const htmlPath = path.join(debugDir, `api-error-${timestamp}.html`);
                    
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    console.log(`Error screenshot saved to: ${screenshotPath}`);
                    
                    const html = await page.content();
                    fs.writeFileSync(htmlPath, html);
                    console.log(`Error HTML saved to: ${htmlPath}`);
                } catch (debugError) {
                    console.error('Error saving debug info:', debugError);
                }
                
                throw error;
            }

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