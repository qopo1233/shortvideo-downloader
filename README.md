# 抖音视频下载器API服务

这是一个基于Express框架的抖音视频下载器API服务，可以获取抖音视频信息并下载视频和封面图片。

## 功能特点

- 提供RESTful API接口获取抖音视频信息
- 支持视频和封面图片下载
- 自动处理验证码和登录弹窗
- 完整的错误处理和日志记录
- 支持静态文件访问下载的视频和图片

## 安装

```bash
# 安装依赖
npm install
```

## 使用方法

### 启动API服务器

```bash
# 启动API服务器
npm start

# 或者使用开发模式（自动重启）
npm run dev
```

服务器默认在3000端口启动，可以通过修改`src/server.js`中的端口配置更改。

### 命令行模式

如果你想使用命令行模式下载单个视频，可以运行：

```bash
npm run start:cli
```

## API文档

### 健康检查

```
GET /api/health
```

返回服务器状态信息。

### 获取视频信息

```
GET /api/video/info?url={抖音视频URL}
```

参数：
- `url`: 抖音视频链接

返回：视频的标题、作者、时长、视频URL和封面URL等信息。

### 下载视频

```
GET /api/video/download?url={抖音视频URL}
```

参数：
- `url`: 抖音视频链接

返回：视频信息以及下载后的本地路径和可访问URL。

## 访问下载的文件

下载的视频可以通过以下URL访问：

```
GET /downloads/{视频文件名}.mp4
```

下载的封面图片可以通过以下URL访问：

```
GET /downloads/covers/{封面文件名}.jpg
```

## 技术栈

- Node.js
- Express.js - Web服务器框架
- Puppeteer - 浏览器自动化工具
- Axios - HTTP客户端
- Morgan - HTTP请求日志记录

## 注意事项

- 本工具仅供学习和研究使用
- 请遵守抖音的使用条款和版权规定
- 不要频繁请求抖音API，以免被封禁IP