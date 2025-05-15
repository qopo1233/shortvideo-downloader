const puppeteer = require('puppeteer');

class UserInfoMonitor {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init() {
        // 启动浏览器
        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1280,800',
                '--start-maximized',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-blink-features=AutomationControlled'
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
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });
    }

    async visitUserPage(userUrl) {
        try {
            console.log('Visiting user page:', userUrl);
            
            // 访问页面
            await this.page.goto(userUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });

            console.log('Page loaded, waiting for __pace_f...');

            // 等待页面加载完成
            await this.page.waitForFunction(() => {
                return document.readyState === 'complete';
            }, { timeout: 30000 });

            // 等待 __pace_f 存在并打印数据
            await this.page.waitForFunction(() => {
                if (window.self && window.self.__pace_f) {
                    // console.log('Found __pace_f:', window.self.__pace_f);
                    return true;
                }
                return false;
            }, { timeout: 30000 });



            // 获取用户信息
            const userInfo = await this.page.evaluate(() => {
                if (window.self && window.self.__pace_f) {
                    console.log('__pace_f length:', window.self.__pace_f.length);
                    
                    // 遍历 __pace_f 数组
                    for (let i = 0; i < window.self.__pace_f.length; i++) {
                        const subArray = window.self.__pace_f[i];
                        
                        // 检查子数组的格式
                        if (Array.isArray(subArray) && subArray.length === 2) {
                            const [type, data] = subArray;
                            
                            // 检查是否是用户信息数据
                            if (type === 1 && typeof data === 'string' && data.startsWith('8:[')) {
                                try {
                                    // 提取数组部分，去掉8:前缀和]\n后缀
                                    const arrayStr = data.substring(2, data.length - 1); // 去掉 '8:' 和 ']\n'
                                    const arrayData = JSON.parse(arrayStr);
                                    
                                    // 检查数组格式
                                    if (Array.isArray(arrayData) && arrayData.length >= 4) {
                                        const userObj = arrayData[3];
                                        if (userObj && userObj.user && userObj.user.user) {
                                            const userData = userObj.user.user;
                                            return {
                                                uid: userData.uid,
                                                secUid: userData.secUid,
                                                nickname: userData.nickname,
                                                desc: userData.desc,
                                                followingCount: userData.followingCount,
                                                followerCount: userData.followerCount,
                                                totalFavorited: userData.totalFavorited,
                                                awemeCount: userData.awemeCount,
                                                avatarUrl: userData.avatarUrl,
                                                uniqueId: userData.uniqueId,
                                                ipLocation: userData.ipLocation,
                                                gender: userData.gender,
                                                age: userData.age,
                                                country: userData.country,
                                                province: userData.province,
                                                city: userData.city,
                                                district: userData.district,
                                                customVerify: userData.customVerify,
                                                isBlocked: userData.isBlocked,
                                                isBlock: userData.isBlock,
                                                isBan: userData.isBan,
                                                timestamp: new Date().toISOString()
                                            };
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Error parsing user data:`, error);
                                }
                            }
                        }
                    }
                }
                return null;
            });

            if (userInfo) {
                console.log('User Information:');
                console.log('----------------');
                for (const [key, value] of Object.entries(userInfo)) {
                    console.log(`${key}: ${value}`);
                }
            } else {
                console.log('No user information found in __pace_f');
            }

            // 等待一段时间，确保数据被捕获
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error('Error visiting user page:', error);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// 使用示例
async function main() {
    const monitor = new UserInfoMonitor();
    
    try {
        await monitor.init();
        await monitor.visitUserPage('https://www.douyin.com/user/MS4wLjABAAAA4ZbhIlGTObA8o6Ha2xjQLpgWZUEUqLsDAVaN-mgBeLJOmTT_s6QLepQKrx8kkVNl');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await monitor.close();
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = UserInfoMonitor; 