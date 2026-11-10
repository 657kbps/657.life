# AGENTS.md

个人网站 657.life，基于 Astro 7 的静态站点，内容以中文为主。部署于 Vercel。

## 常用命令

- `pnpm dev` — 本地开发（使用 pnpm，勿用 npm/yarn）
- `pnpm build` / `pnpm preview` — 构建与预览
- `pnpm mermaid:build` — 扫描文章中的 Mermaid 图表并更新 `src/data/mermaid-cache.json`（需要本机 Chrome）

### Mermaid 图表

Vercel 构建镜像不预装 Chrome，线上构建只读取已提交的 `src/data/mermaid-cache.json`，不会启动浏览器。
新增或修改文章中的 Mermaid 图表后，请先在本地运行 `pnpm mermaid:build`（或 `pnpm build`）并提交缓存文件；否则 Vercel 构建会明确报错并列出缺失的图表。

### Astro CLI

均通过 pnpm 调用，如 `pnpm astro <command>`：

- `pnpm astro check` — 类型检查（基于 @astrojs/check）
- `pnpm astro sync` — 同步内容集合，生成类型定义（修改 `content.config.ts` 后运行）
- `pnpm astro add <integration>` — 添加官方集成（会修改 astro.config.mjs）
- `pnpm astro info` — 查看环境与诊断信息

## 修改规范

- 文章标签使用简洁的中文短词（参考现有文章的 随笔、虚构、咖啡 等）
- 改动组件、样式后运行 `pnpm build` 确认无构建错误
- 站点配置在 `astro.config.mjs`（站点 URL 为 `https://657.life`）

## 环境变量

复制 `.env.example` 为 `.env` 以启用 Google Search Console 验证（`PUBLIC_GOOGLE_SITE_VERIFICATION`），非必填。
