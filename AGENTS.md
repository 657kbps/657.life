# AGENTS.md

个人网站 657.life，基于 Astro 7 的静态站点，内容以中文为主。部署于 Vercel。

## 常用命令

- `pnpm dev` — 本地开发（使用 pnpm，勿用 npm/yarn）
- `pnpm build` / `pnpm preview` — 构建与预览

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
