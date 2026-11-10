import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_FILE_PATH = path.resolve(__dirname, '../data/mermaid-cache.json');

/**
 * 缓存协议版本。
 * 修改 Mermaid 版本、主题、flowchart/pie 配置或渲染后处理逻辑时，请递增此版本，
 * 以便已有缓存全部失效并重新生成，避免部署出旧主题的 SVG。
 */
export const MERMAID_CACHE_VERSION = 'v2-2026-11-10-wrapping420';

/**
 * Vercel / 无浏览器环境（cache-only 模式）。
 * Vercel 构建镜像不预装 Chrome，因此线上构建只读取已提交的缓存，不启动浏览器。
 */
export function isOfflineRenderMode() {
  return (
    process.env.MERMAID_OFFLINE === '1' ||
    process.env.VERCEL === '1' ||
    process.env.VERCEL === 'true'
  );
}

export function getMermaidCacheKey(source) {
  return crypto
    .createHash('sha256')
    .update(`${MERMAID_CACHE_VERSION}\n${source.trim()}`)
    .digest('hex')
    .slice(0, 16);
}

export function loadMermaidCache() {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[mermaid] Failed to read cache, starting fresh:', err.message);
  }
  return {};
}

export function saveMermaidCache(cache) {
  const dir = path.dirname(CACHE_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}
