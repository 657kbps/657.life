import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderMermaidToHtml, closeBrowser } from './mermaid-renderer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE_PATH = path.resolve(__dirname, '../data/mermaid-cache.json');

// 内存中的缓存对象
let cache = null;
let isCacheDirty = false;

function loadCache() {
  if (cache) return cache;
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
      cache = JSON.parse(raw);
    } else {
      cache = {};
    }
  } catch (err) {
    console.warn('[remark-mermaid] Failed to load mermaid cache, starting fresh:', err);
    cache = {};
  }
  return cache;
}

function saveCache() {
  if (!isCacheDirty || !cache) return;
  try {
    const dir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf8');
    isCacheDirty = false;
  } catch (err) {
    console.error('[remark-mermaid] Failed to save mermaid cache:', err);
  }
}

// 递归遍历 AST
function collectMermaidNodes(node, list = []) {
  if (!node) return list;
  if (node.type === 'code' && (node.lang === 'mermaid' || node.lang === 'mermaid-diagram')) {
    list.push(node);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectMermaidNodes(child, list);
    }
  }
  return list;
}

/**
 * Remark 插件：在构建期将 Markdown 中的 ```mermaid 代码块预渲染为静态内联 SVG
 */
export default function remarkMermaid() {
  return async function transformer(tree) {
    loadCache();
    const mermaidNodes = collectMermaidNodes(tree);

    if (mermaidNodes.length === 0) return;

    for (let i = 0; i < mermaidNodes.length; i++) {
      const node = mermaidNodes[i];
      const source = (node.value || '').trim();
      if (!source) continue;

      // 根据代码源码计算 SHA256 哈希值
      const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);

      if (cache[hash]) {
        // 命中静态缓存：直接输出预渲染好的内联 SVG HTML 结构
        node.type = 'html';
        node.value = cache[hash];
      } else {
        // 未命中缓存：尝试通过无头浏览器实时渲染
        try {
          const id = `mermaid-svg-${hash}`;
          const renderedHtml = await renderMermaidToHtml(source, id);
          cache[hash] = renderedHtml;
          isCacheDirty = true;

          node.type = 'html';
          node.value = renderedHtml;
        } catch (err) {
          console.error(`[remark-mermaid] Error rendering mermaid diagram (${hash}):`, err.message);
          // 优雅降级：保留代码块，以便构建不中断
        }
      }
    }

    saveCache();
  };
}

// 进程退出或完成时释放无头浏览器
process.on('beforeExit', async () => {
  saveCache();
  await closeBrowser();
});
