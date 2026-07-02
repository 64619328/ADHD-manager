# 微信小程序版本

这是当前任务管理工具的原生微信小程序 MVP，复用现有 Next.js REST API。

## 本地调试

1. 先在项目根目录启动 Web/API 服务：

```bash
npm run dev
```

2. 用微信开发者工具打开 `miniprogram/` 目录。
3. 开发者工具中勾选「不校验合法域名、web-view、TLS 版本以及 HTTPS 证书」。
4. 默认 API 地址在 `app.js`：

```js
apiBaseUrl: "http://localhost:3000"
```

真机预览不能直接访问电脑的 `localhost`。需要把 `apiBaseUrl` 改成电脑局域网 IP，或后续部署到 HTTPS 域名。

## 当前功能

- 查看任务列表，按「进行中 / 未开始 / 已完成」分组。
- 新建任务，支持目标、优先级、DDL、待办项。
- 查看任务详情。
- 编辑任务目标、状态、优先级、DDL。
- 新增、完成、删除待办项。
- 新增进度记录。

## 后续接入云端

当 Web/API 部署到线上 HTTPS 域名后，把 `app.js` 中的 `apiBaseUrl` 改成线上地址即可。微信正式版还需要在小程序后台配置 request 合法域名。
