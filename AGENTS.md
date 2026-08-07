# AGENTS.md

个人网站 657.life，基于 Astro 7 的静态站点，内容以中文为主。部署于 Vercel。

## 常用命令

- `pnpm dev` — 本地开发（使用 pnpm，勿用 npm/yarn）
- `pnpm build` / `pnpm preview` — 构建与预览
- `pnpm new-post` — 新建文章（交互式，中文标题自动转拼音 slug，生成 frontmatter 骨架）

### Astro CLI

均通过 pnpm 调用，如 `pnpm astro <command>`：

- `pnpm astro check` — 类型检查（基于 @astrojs/check）
- `pnpm astro sync` — 同步内容集合，生成类型定义（修改 `content.config.ts` 后运行）
- `pnpm astro add <integration>` — 添加官方集成（会修改 astro.config.mjs）
- `pnpm astro info` — 查看环境与诊断信息

## 项目结构

- `src/content/posts/` — 所有文章（Markdown/MDX），文件名即 slug
- `src/content.config.ts` — 内容集合 schema（Zod）：`title`、`description`、`date`、`categories`、`tags` 均为必填
- `src/pages/` — 路由：首页、`/posts/[slug]`（含 JSON-LD）、`/list`、`/search`、`/rss.xml`、`/search-index.json`
- `src/components/` — Astro 组件（Layout、Article、Sidebar 等）
- `src/styles/global.css` — 全局样式
- `scripts/new-post.mjs` — 新建文章脚本

## 修改规范

- 新增文章前先运行 `pnpm new-post` 生成骨架，再填充内容；frontmatter 字段必须齐全，缺失会导致 `astro build` 校验失败
- 文章分类/标签使用简洁的中文短词（参考现有文章的 随笔、虚构、咖啡 等）
- 改动组件、样式后运行 `pnpm build` 确认无构建错误
- 站点配置在 `astro.config.mjs`（站点 URL 为 `https://657.life`）

## 环境变量

复制 `.env.example` 为 `.env` 以启用 Google Search Console 验证（`PUBLIC_GOOGLE_SITE_VERIFICATION`），非必填。
