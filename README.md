# 你画我猜

一家人联机的你画我猜：<https://draw-guess.sdcb.ai>

每人用一台手机或平板加入同一个房间（2–10 人），轮流画画，其他人猜。支持语音（发出后其他人自动播放），可以安装成 PWA 应用。

## 玩法

- 轮到画的人从内置儿童词库的三个词里选一个，也可以自己出题
- 猜的人打字，猜对自动判定；用嘴说或发语音猜的，画的人点他的名字判对
- 猜得越快分越高（20–100 分），每有一人猜中画的人得 25 分
- 提示：一直显示字数和类别，过半时间揭示一个字，3 字以上的词在 75% 时再揭示一个
- 画板：11 种颜色、3 档粗细、橡皮、颜料桶、撤销、清空
- 每题结束和整局结束时可以把画保存到相册/下载

## 技术栈

- 前端：Vite + React 19 + Tailwind CSS 4 + TypeScript
- 后端：一个 Cloudflare Worker，静态资源 + Durable Object（每个房间一个实例，WebSocket Hibernation，计时用 alarm）
- `shared/`：前后端共用的游戏状态机（`game.ts`）、画画操作（`draw.ts`）、颜料桶算法（`fill.ts`）、词库（`words.ts`）、消息协议

## 开发

```bash
npm install
npm run dev     # 前端 + Worker + Durable Object 一起跑在本地
npm test
npm run lint
npm run build
```

推送到 `main` 后由 GitHub Actions 自动部署（需要仓库 secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`）。

## 防滥用

- 按 IP 限流：建房每分钟 5 次，连接/取语音每分钟 300 次
- 拒绝跨站请求（检查 `Origin`）
- 每个连接 10 秒最多 30 条普通消息、400 条画画消息；语音最长 15 秒、至少间隔 3 秒、约 300 KB 上限
- 只有一人的房间 2 小时后清理，多人房闲置 24 小时后清理；每个房间只保留最近 40 条语音

## License

AGPL-3.0
