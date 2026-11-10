import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://657.life",
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: "none",
    },
  },
});
