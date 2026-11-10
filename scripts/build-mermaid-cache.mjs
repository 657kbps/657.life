#!/usr/bin/env node
/**
 * 构建期 Mermaid 缓存生成器
 *
 * - 扫描 src/content/posts 下所有 Markdown/MDX 中的 mermaid 代码块
 * - 对缺失的图表调用本地无头 Chrome 渲染，并写入 src/data/mermaid-cache.json
 * - 在 Vercel（无 Chrome）环境只做缓存完整性校验：
 *   若发现缺失缓存，直接报错并提示先在本地运行 `pnpm mermaid:build`，避免线上静默降级成裸代码块
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CACHE_FILE_PATH,
  getMermaidCacheKey,
  isOfflineRenderMode,
  loadMermaidCache,
  saveMermaidCache,
} from '../src/plugins/mermaid-cache.mjs';
import { closeBrowser, renderMermaidToHtml } from '../src/plugins/mermaid-renderer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'src/content/posts');
const ASTRO_CACHE_DIRS = [
  path.join(ROOT, '.astro'),
  path.join(ROOT, 'node_modules/.astro'),
];

/**
 * Astro 的内容缓存（.astro / node_modules/.astro 下的 data-store.json）不会感知外部
 * mermaid-cache.json 的变化。只要缓存内容有增删，就清掉内容缓存，确保下一次 astro build
 * 使用新的 SVG。
 */
function invalidateAstroContentCache() {
  for (const dir of ASTRO_CACHE_DIRS) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[mermaid] Cleared ${path.relative(ROOT, dir)} content cache to force re-render.`);
    }
  }
}

function walkMarkdownFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, files);
    } else if (entry.isFile() && /\.(md|mdx)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * 提取 fenced code block 中的 mermaid 源码。
 * 支持 ``` 或 ~~~ 围栏，以及 mermaid / mermaid-diagram 语言标记。
 */
function extractMermaidBlocks(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const blocks = [];
  const fencePattern =
    /^([ \t]*)(`{3,}|~{3,})[ \t]*mermaid(?:-diagram)?[^\n]*\n([\s\S]*?)^\1\2[ \t]*$/gm;

  let match;
  while ((match = fencePattern.exec(text)) !== null) {
    const source = match[3].trim();
    if (!source) continue;
    const line = text.slice(0, match.index).split('\n').length;
    blocks.push({ source, line });
  }
  return blocks;
}

async function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('[mermaid] No content directory found, skipping.');
    return;
  }

  const files = walkMarkdownFiles(CONTENT_DIR);
  const diagrams = new Map(); // key -> { source, file, line }

  for (const file of files) {
    for (const block of extractMermaidBlocks(file)) {
      const key = getMermaidCacheKey(block.source);
      if (!diagrams.has(key)) {
        diagrams.set(key, {
          source: block.source,
          file: path.relative(ROOT, file),
          line: block.line,
        });
      }
    }
  }

  if (diagrams.size === 0) {
    console.log('[mermaid] No mermaid diagrams found.');
    return;
  }

  const cache = loadMermaidCache();
  const missing = [...diagrams.entries()].filter(([key]) => !cache[key]);
  const staleKeys = Object.keys(cache).filter((key) => !diagrams.has(key));
  const offline = isOfflineRenderMode();

  if (missing.length === 0 && staleKeys.length === 0) {
    console.log(
      `[mermaid] ${diagrams.size} diagram(s) verified in cache (${path.relative(ROOT, CACHE_FILE_PATH)}).`
    );
    return;
  }

  if (offline && missing.length > 0) {
    console.error('[mermaid] Build aborted: cache is incomplete and this environment cannot launch a browser.');
    console.error(`[mermaid] Missing ${missing.length} diagram(s):`);
    for (const [key, entry] of missing) {
      console.error(`  - ${entry.file}:${entry.line} (cache key ${key})`);
    }
    console.error('[mermaid] Run `pnpm mermaid:build` locally, then commit src/data/mermaid-cache.json.');
    process.exit(1);
  }

  if (missing.length > 0) {
    console.log(`[mermaid] Rendering ${missing.length} missing diagram(s) with headless Chrome...`);

    try {
      for (const [key, entry] of missing) {
        try {
          const html = await renderMermaidToHtml(entry.source, `mermaid-svg-${key}`);
          cache[key] = html;
          console.log(`  ✓ ${entry.file}:${entry.line}`);
        } catch (err) {
          console.error(`  ✗ ${entry.file}:${entry.line}`);
          throw new Error(`Failed to render mermaid diagram at ${entry.file}:${entry.line}: ${err.message}`);
        }
      }
    } finally {
      await closeBrowser();
    }
  }

  // 只保留当前文章实际引用的图表，避免旧版本缓存无限累积。
  const nextCache = {};
  for (const key of diagrams.keys()) {
    if (cache[key]) nextCache[key] = cache[key];
  }

  saveMermaidCache(nextCache);
  invalidateAstroContentCache();

  if (staleKeys.length > 0) {
    console.log(`[mermaid] Removed ${staleKeys.length} stale cache entr${staleKeys.length === 1 ? 'y' : 'ies'}.`);
  }
  console.log(
    `[mermaid] Cache updated: ${path.relative(ROOT, CACHE_FILE_PATH)} (${diagrams.size} diagram(s) total).`
  );
}

main().catch((err) => {
  console.error('[mermaid]', err.message);
  process.exit(1);
});
