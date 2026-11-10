import {
  getMermaidCacheKey,
  isOfflineRenderMode,
  loadMermaidCache,
  saveMermaidCache,
} from './mermaid-cache.mjs';

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
 * Remark 插件：把 ```mermaid 代码块替换为构建期预渲染好的静态内联 SVG。
 *
 * 设计原则：
 * - 构建产物完全由 src/data/mermaid-cache.json 决定，页面运行时不需要 Mermaid JS；
 * - Vercel 构建环境没有 Chrome，只做缓存读取；缓存缺失时明确报错，绝不静默降级；
 * - 本地 `pnpm dev` 遇到新图表时可即时渲染并回写缓存，方便预览。
 */
export default function remarkMermaid() {
  return async function transformer(tree) {
    const mermaidNodes = collectMermaidNodes(tree);
    if (mermaidNodes.length === 0) return;

    const cache = loadMermaidCache();
    let cacheChanged = false;

    for (const node of mermaidNodes) {
      const source = (node.value || '').trim();
      if (!source) continue;

      const key = getMermaidCacheKey(source);

      if (cache[key]) {
        node.type = 'html';
        node.value = cache[key];
        continue;
      }

      // 本地开发或无 Vercel 环境：尝试用本机 Chrome 即时渲染
      if (!isOfflineRenderMode()) {
        try {
          const { renderMermaidToHtml } = await import('./mermaid-renderer.mjs');
          const html = await renderMermaidToHtml(source, `mermaid-svg-${key}`);
          cache[key] = html;
          cacheChanged = true;
          node.type = 'html';
          node.value = html;
          continue;
        } catch (err) {
          console.warn(
            `[remark-mermaid] Could not render diagram at line ${node.position?.start?.line ?? '?'}: ${err.message}`
          );
          continue;
        }
      }

      throw new Error(
        `[remark-mermaid] Missing pre-rendered SVG for diagram at line ${
          node.position?.start?.line ?? '?'
        } (cache key ${key}). Run \`pnpm mermaid:build\` locally and commit src/data/mermaid-cache.json.`
      );
    }

    if (cacheChanged) {
      saveMermaidCache(cache);
    }
  };
}
