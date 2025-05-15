const express = require('express');
const { DouyinDownloader } = require('./index');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');

/**
 * 抖音下载器API服务器
 * 提供视频信息获取和下载功能的RESTful API
 */
class DouyinDownloaderServer {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {number} options.port - 服务器端口号
     * @param {number} options.maxPoolSize - 浏览器池最大大小
     * @param {number} options.maxQueueSize - 请求队列最大大小
     */
    constructor(options = {}) {
        this.port = options.port || 3001;
        this.app = express();
        this.downloaderOptions = {
            maxPoolSize: options.maxPoolSize || 5,
            maxQueueSize: options.maxQueueSize || 100,
            browserTimeout: options.browserTimeout || 300000 // 5分钟
        };
        this.downloader = null;
        this.isInitialized = false;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * 设置中间件
     */
    setupMiddleware() {
        // 解析JSON请求体
        this.app.use(express.json());
        
        // 设置请求日志
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // 创建日志文件流
        const accessLogStream = fs.createWriteStream(
            path.join(logsDir, 'access.log'), 
            { flags: 'a' }
        );
        
        // 使用morgan记录HTTP请求日志
        this.app.use(morgan('combined', { stream: accessLogStream }));
        
        // 开发环境下同时在控制台输出日志
        this.app.use(morgan('dev'));
        
        // 设置静态文件目录，用于访问下载的视频和封面
        this.app.use('/downloads', express.static(path.join(__dirname, '../downloads')));
    }

    /**
     * 设置API路由
     */
    setupRoutes() {
        // 健康检查接口
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'ok', message: '抖音下载器API服务正常运行' });
        });

        // 获取视频信息接口
        this.app.post('/api/video/info', async (req, res, next) => {
            try {
                const { sharedText } = req.body;
                let videoUrl;
                
                if (!sharedText) {
                    return res.status(400).json({ 
                        error: '缺少参数', 
                        message: '请提供抖音分享文本' 
                    });
                }
                
                // 从分享文本中提取URL
                const urlRegex = /(https?:\/\/[^\s]+)/;
                const match = sharedText.match(urlRegex);
                
                if (match && match[1]) {
                    videoUrl = match[1];
                } else {
                    return res.status(400).json({ 
                        error: '无效的分享文本', 
                        message: '无法从分享文本中提取URL' 
                    });
                }
                
                // 确保下载器已初始化
                await this.ensureDownloaderInitialized();
                
                // 获取视频信息
                const videoInfo = await this.downloader.getVideoInfo(videoUrl);
                
                res.json({
                    success: true,
                    data: videoInfo
                });
            } catch (error) {
                next(error);
            }
        });
    }

    /**
     * 设置错误处理中间件
     */
    setupErrorHandling() {
        // 404错误处理
        this.app.use((req, res) => {
            res.status(404).json({
                error: '接口不存在',
                message: `找不到请求的路径: ${req.originalUrl}`
            });
        });

        // 全局错误处理
        this.app.use((err, req, res, next) => {
            console.error('API错误:', err);
            
            res.status(err.status || 500).json({
                error: err.name || '服务器错误',
                message: err.message || '服务器内部错误',
                stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
            });
        });
    }

    /**
     * 确保下载器已初始化
     */
    async ensureDownloaderInitialized() {
        if (!this.downloader || !this.isInitialized) {
            console.log('初始化浏览器池...');
            this.downloader = new DouyinDownloader(this.downloaderOptions);
            // 不需要再调用init，浏览器池已在构造函数中初始化
            this.isInitialized = true;
            
            // 设置进程退出时关闭浏览器池
            process.on('SIGINT', async () => {
                console.log('正在关闭浏览器池...');
                if (this.downloader) {
                    await this.downloader.close();
                }
                process.exit(0);
            });
            
            console.log(`浏览器池初始化完成，最大池大小: ${this.downloaderOptions.maxPoolSize}, 最大队列大小: ${this.downloaderOptions.maxQueueSize}`);
        }
        return this.downloader;
    }

    /**
     * 启动服务器
     * @returns {Promise<void>}
     */
    async start() {
        return new Promise((resolve) => {
            this.server = this.app.listen(this.port, () => {
                console.log(`抖音下载器API服务已启动，监听端口: ${this.port}`);
                resolve();
            });
        });
    }

    /**
     * 关闭服务器
     * @returns {Promise<void>}
     */
    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(async () => {
                    console.log('服务器已关闭');
                    if (this.downloader) {
                        await this.downloader.close();
                        console.log('浏览器已关闭');
                    }
                    resolve();
                });
            });
        }
    }
}

module.exports = { DouyinDownloaderServer };

// 如果直接运行此文件，则启动服务器
if (require.main === module) {
    // 配置选项
    const options = {
        port: 3001,           // 服务器端口
        maxPoolSize: 5,      // 浏览器池最大大小
        maxQueueSize: 100,   // 请求队列最大大小
        browserTimeout: 300000 // 浏览器实例超时时间（5分钟）
    };
    
    const server = new DouyinDownloaderServer(options);
    server.start().catch(console.error);
}