const fs = require('fs');
const path = require('path');
/**
 * fetchDouyinDetail.js
 * 实现无需浏览器即可请求抖音 aweme detail 接口，注意反爬虫措施。
 * 
 * 使用方法：
 *   node fetchDouyinDetail.js <aweme_id>
 *
 * @author AI
 */
const axios = require('axios');

/**
 * 获取抖音 aweme detail 信息
 * @param {string} awemeId - 视频ID
 * @param {string} [cookie] - 可选，抖音cookie字符串
 * @returns {Promise<Object>} - 返回接口响应数据
 */
async function fetchDouyinDetail(awemeId, cookie = '') {
    // 关键请求头伪装
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Referer': 'https://www.douyin.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cookie': cookie,
        // 其他可能需要的头部
    };
    // 反爬虫参数补全
    const params = {
        aid: 6383,
        channel: "channel_pc_web",
        device_platform: "webapp",
        pc_client_type: 1,
        pc_libra_divert: "Mac",
        version_code: 190500,
        version_name: "19.5.0",
        cookie_enabled: true,
        screen_width: 1440, // 建议实际调用时传 window.outerWidth
        screen_height: 900, // 建议实际调用时传 window.outerHeight
        browser_language: "zh-CN",
        browser_platform: "MacIntel",
        browser_name: "Chrome",
        browser_version: "136.0.0.0",
        browser_online: true,
        engine_name: "Blink",
        engine_version: "136.0.0.0",
        os_name: "Mac OS",
        os_version: "10.15.7",
        cpu_core_num: 8,
        device_memory: 16,
        platform: "PC",
        effective_type: "3g",
        round_trip_time: 600,
        aweme_id: awemeId
    };
    const url = 'https://www.douyin.com/aweme/v1/web/aweme/detail/';
    try {
        const response = await axios.get(url, {
            headers,
            params,
            timeout: 15000
        });
        if (response.data && response.data.status_code === 0) {
            return response.data;
        } else {
            throw new Error('接口返回异常: ' + JSON.stringify(response.data));
        }
    } catch (error) {
        // 反爬虫拦截时通常会返回403/412等
        if (error.response) {
            console.error('请求被拦截，状态码:', error.response.status);
            console.error('响应内容:', error.response.data);
        } else {
            console.error('请求异常:', error.message);
        }
        throw error;
    }
}

/**
 * 命令行测试入口
 */
/**
 * 从 cookies.json 文件读取 cookie 字符串
 * @returns {string} - 返回拼接好的 cookie 字符串
 */
function readCookieFromFile() {
    try {
        const cookieFilePath = path.join(__dirname, '../cookies.json');
        if (!fs.existsSync(cookieFilePath)) {
            console.warn('未找到 cookies.json 文件，未设置 Cookie');
            return '';
        }
        const cookieJson = fs.readFileSync(cookieFilePath, 'utf8');
        // 假设 cookies.json 为对象格式 { "cookie": "xxx=yyy; ..." }
        const cookieObj = JSON.parse(cookieJson);
        if (typeof cookieObj === 'string') {
            return cookieObj;
        } else if (cookieObj.cookie) {
            return cookieObj.cookie;
        } else if (Array.isArray(cookieObj)) {
            // 兼容数组格式
            return cookieObj.map(item => item.name && item.value ? `${item.name}=${item.value}` : '').filter(Boolean).join('; ');
        }
        return '';
    } catch (err) {
        console.error('读取 cookies.json 失败:', err.message);
        return '';
    }
}
if (require.main === module) {
    const awemeId = process.argv[2];
    if (!awemeId) {
        console.error('请提供aweme_id参数，例如: node fetchDouyinDetail.js 7498656370800086323');
        process.exit(1);
    }
    // 自动读取 cookies.json
    const cookie = readCookieFromFile();
    fetchDouyinDetail(awemeId, cookie)
        .then(data => {
            console.log('抖音视频信息:', JSON.stringify(data, null, 2));
        })
        .catch(err => {
            console.error('获取失败:', err.message);
        });
}

module.exports = { fetchDouyinDetail };