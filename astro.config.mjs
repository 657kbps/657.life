import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkMermaid from "./src/plugins/remark-mermaid.mjs";

export default defineConfig({
  site: "https://657.life",
  integrations: [mdx(), sitemap()],
  markdown: {
    remarkPlugins: [remarkMermaid],
    shikiConfig: {
      theme: "none",
    },
  },
});
