import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkMermaid from "./src/plugins/remark-mermaid.mjs";

export default defineConfig({
  site: "https://657.life",
  integrations: [mdx(), sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMermaid],
    }),
    shikiConfig: {
      theme: "none",
    },
  },
});
