import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { pinyin } from "pinyin-pro";

const __dirname = dirname(fileURLToPath(import.meta.url));
const postsDir = join(__dirname, "../src/content/posts");

function titleToSlug(title) {
  const converted = pinyin(title, { toneType: "none", nonZh: "consecutive" });

  return converted
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildContent(title, date) {
  return `---
title: ${title}
description: 
date: ${date}
categories:
tags:
---

`;
}

async function main() {
  const rl = createInterface({ input, output });
  const title = (await rl.question("标题: ")).trim();
  rl.close();

  if (!title) {
    console.error("标题不能为空");
    process.exit(1);
  }

  const slug = titleToSlug(title);
  if (!slug) {
    console.error("无法从标题生成有效的文件名");
    process.exit(1);
  }

  const filePath = join(postsDir, `${slug}.md`);

  try {
    await access(filePath, constants.F_OK);
    console.error(`文件已存在: ${relative(process.cwd(), filePath)}`);
    process.exit(1);
  } catch {
    // File does not exist yet.
  }

  const content = buildContent(title, getDateString());
  await writeFile(filePath, content, "utf8");
  console.log(`Created ${relative(process.cwd(), filePath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
