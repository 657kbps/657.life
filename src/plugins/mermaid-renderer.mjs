import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findChromeExecutable() {
  const envPath = process.env.CHROME_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  const home = process.env.HOME || '';
  const pwDir = path.join(home, '.cache/ms-playwright');
  if (fs.existsSync(pwDir)) {
    try {
      const entries = fs.readdirSync(pwDir);
      for (const entry of entries) {
        if (entry.startsWith('chromium_headless_shell-')) {
          const p = path.join(pwDir, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
          if (fs.existsSync(p)) return p;
        }
        if (entry.startsWith('chromium-')) {
          const p = path.join(pwDir, entry, 'chrome-linux', 'chrome');
          if (fs.existsSync(p)) return p;
        }
      }
    } catch {}
  }

  return null;
}

let browserInstance = null;
let pageInstance = null;
let mermaidScriptContent = null;

async function getPage() {
  if (pageInstance) return pageInstance;

  const executablePath = findChromeExecutable();
  if (!executablePath) {
    throw new Error('No Chrome / Chromium executable found on system');
  }

  const { chromium } = await import('playwright-core');
  browserInstance = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browserInstance.newPage();
  
  if (!mermaidScriptContent) {
    const nodeModulesPath = path.resolve(__dirname, '../../node_modules/mermaid/dist/mermaid.min.js');
    if (fs.existsSync(nodeModulesPath)) {
      mermaidScriptContent = fs.readFileSync(nodeModulesPath, 'utf8');
    } else {
      throw new Error(`Mermaid script not found at ${nodeModulesPath}`);
    }
  }

  await page.setContent(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="mermaid-workspace"></div>
</body>
</html>`);

  await page.addScriptTag({ content: mermaidScriptContent });

  // 初始化 Mermaid 配置（与 657.life 莫兰迪视觉规范完全对齐）
  await page.evaluate(() => {
    const mutedPalette = ['#84a59d', '#c97b63', '#ddb892', '#7e92a0', '#9a8c98', '#b5838d'];

    // @ts-ignore
    window.mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: '15px',
        primaryColor: '#fafaf9',
        primaryTextColor: '#1a1a1a',
        primaryBorderColor: '#333333',
        lineColor: '#555555',
        secondaryColor: '#f4f4f2',
        tertiaryColor: '#ffffff',
        edgeLabelBackground: '#fafaf9',
        clusterBkg: '#fcfcfb',
        clusterBorder: '#d4d4d0',
        mainBkg: '#fafaf9',
        nodeBorder: '#333333',
        pie1: mutedPalette[0],
        pie2: mutedPalette[1],
        pie3: mutedPalette[2],
        pie4: mutedPalette[3],
        pie5: mutedPalette[4],
        pie6: mutedPalette[5],
        pieTitleTextSize: '16px',
        pieTitleTextColor: '#1a1a1a',
        pieSectionTextColor: '#ffffff',
        pieLegendTextColor: '#333333',
        pieLegendTextSize: '13px',
        pieStrokeColor: '#ffffff',
        pieStrokeWidth: '2px',
      },
      themeCSS: `
        * {
          filter: none !important;
          box-shadow: none !important;
          text-shadow: none !important;
        }
        .node rect, .node circle, .node ellipse, .node polygon, .node path {
          filter: none !important;
          box-shadow: none !important;
        }
        .cluster rect {
          filter: none !important;
          box-shadow: none !important;
        }
        .label {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif !important;
          line-height: 1.5 !important;
        }
        .pieTitleText {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif !important;
          font-weight: 600 !important;
          fill: #1a1a1a !important;
        }
        .slice text {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif !important;
          font-weight: 600 !important;
          fill: #ffffff !important;
        }
        .legend text {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif !important;
          font-size: 13px !important;
          fill: #444444 !important;
        }
        .pieOuterCircle {
          stroke: none !important;
          stroke-width: 0 !important;
          display: none !important;
        }
      `,
      flowchart: {
        curve: 'basis',
        padding: 24,
        nodeSpacing: 50,
        rankSpacing: 50,
        htmlLabels: true,
        useMaxWidth: false,
        wrappingWidth: 420,
      },
      pie: {
        useMaxWidth: false,
      },
    });
  });

  pageInstance = page;
  return page;
}

/**
 * 在无头浏览器中渲染单个 Mermaid 图表，并执行后处理
 * @param {string} source Mermaid 代码字符串
 * @param {string} id 唯一元素 ID
 * @returns {Promise<string>} 处理后的 HTML 包装字符串
 */
export async function renderMermaidToHtml(source, id = `mermaid-build-${Date.now()}`) {
  const page = await getPage();

  const resultHtml = await page.evaluate(async ({ source, id }) => {
    const mutedPalette = ['#84a59d', '#c97b63', '#ddb892', '#7e92a0', '#9a8c98', '#b5838d'];

    // @ts-ignore
    const { svg } = await window.mermaid.render(id, source);

    const container = document.createElement('div');
    container.className = 'mermaid-chart-wrapper';
    container.setAttribute('title', '点击全屏查看');
    container.style.cursor = 'zoom-in';
    container.innerHTML = svg;

    const svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.removeAttribute('filter');
      svgEl.querySelectorAll('*').forEach((el) => {
        el.removeAttribute('filter');
      });
      svgEl.style.removeProperty('max-width');
    }

    // 饼图莫兰迪低饱和度着色保障与外围深色圆圈去除
    container.querySelectorAll('.pieOuterCircle').forEach((circle) => {
      circle.setAttribute('stroke', 'none');
      circle.setAttribute('stroke-width', '0');
      circle.style.display = 'none';
    });

    const slices = container.querySelectorAll('.pieCircle, g.slices path, .slice path');
    slices.forEach((slice, idx) => {
      slice.setAttribute('fill', mutedPalette[idx % mutedPalette.length]);
      slice.setAttribute('stroke', '#ffffff');
      slice.setAttribute('stroke-width', '2px');
    });

    const legendRects = container.querySelectorAll('g.legend rect, .legend rect');
    legendRects.forEach((rect, idx) => {
      rect.setAttribute('fill', mutedPalette[idx % mutedPalette.length]);
      rect.setAttribute('stroke', '#ffffff');
      rect.setAttribute('stroke-width', '1px');
    });

    return container.outerHTML;
  }, { source, id });

  return resultHtml;
}

export async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {}
    browserInstance = null;
    pageInstance = null;
  }
}
