#!/usr/bin/env node

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const readmePath = path.join(root, "README.md");
const indexPath = path.join(root, "index.html");

const syncStart = "<!-- SYNC:START -->";
const syncEnd = "<!-- SYNC:END -->";
const write = process.argv.includes("--write");

function readFile(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
}

function lastChangeTime(filePath) {
  try {
    const timestamp = execSync(
      `git log -1 --format=%ct -- "${filePath}"`,
      { cwd: root, encoding: "utf8" }
    ).trim();

    if (timestamp) {
      return Number(timestamp) * 1000;
    }
  } catch {
    // Fall back to filesystem modification time for new/uncommitted files.
  }

  return existsSync(filePath) ? statSync(filePath).mtimeMs : 0;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdownToHtml(value) {
  let output = escapeHtml(value);

  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );

  return output;
}

function parseReadmeCards(markdown) {
  const lines = markdown.split(/\r?\n/);
  const cards = [];
  let card = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.*)$/);

    if (heading) {
      if (card) {
        cards.push(card);
      }

      card = {
        title: heading[1].trim(),
        body: []
      };

      continue;
    }

    if (card) {
      card.body.push(line);
    }
  }

  if (card) {
    cards.push(card);
  }

  return cards;
}

function markdownBodyToHtml(lines) {
  const html = [];
  let insideCodeBlock = false;
  let listItems = [];

  function flushList() {
    if (listItems.length === 0) {
      return;
    }

    html.push("<ul>");

    for (const item of listItems) {
      html.push(`<li>${inlineMarkdownToHtml(item)}</li>`);
    }

    html.push("</ul>");
    listItems = [];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushList();

      if (!insideCodeBlock) {
        html.push("<pre><code>");
        insideCodeBlock = true;
      } else {
        html.push("</code></pre>");
        insideCodeBlock = false;
      }

      continue;
    }

    if (insideCodeBlock) {
      html.push(escapeHtml(line));
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.*)$/);

    if (listItem) {
      listItems.push(listItem[1]);
      continue;
    }

    flushList();

    if (line.trim() === "") {
      continue;
    }

    const subheading = line.match(/^###\s+(.*)$/);

    if (subheading) {
      html.push(`<h4>${inlineMarkdownToHtml(subheading[1])}</h4>`);
      continue;
    }

    html.push(`<p>${inlineMarkdownToHtml(line)}</p>`);
  }

  flushList();

  if (insideCodeBlock) {
    html.push("</code></pre>");
  }

  return html.join("\n      ");
}

function cardsToHtml(cards) {
  return cards
    .map((card) => {
      return `<article class="card">
      <h3>${escapeHtml(card.title)}</h3>
      ${markdownBodyToHtml(card.body)}
    </article>`;
    })
    .join("\n\n    ");
}

function buildIndexHtml(existingIndex, markdown) {
  const cards = parseReadmeCards(markdown);
  const generatedCards = cardsToHtml(cards);

  const syncedContent = `${syncStart}
    ${generatedCards}
    ${syncEnd}`;

  if (
    existingIndex &&
    existingIndex.includes(syncStart) &&
    existingIndex.includes(syncEnd)
  ) {
    const start = existingIndex.indexOf(syncStart);
    const end = existingIndex.indexOf(syncEnd) + syncEnd.length;

    return (
      existingIndex.slice(0, start) +
      syncedContent +
      existingIndex.slice(end)
    );
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DevOps Bootcamp Project</title>
  <style>
    body {
      margin: 0;
      background: #0b0f14;
      color: #e6e6e6;
      font-family: system-ui, sans-serif;
    }

    .hero {
      padding: 3rem 1.5rem;
      text-align: center;
    }

    main {
      display: grid;
      gap: 1.25rem;
      max-width: 960px;
      margin: 0 auto;
      padding: 0 1.5rem 3rem;
    }

    .card {
      padding: 1.25rem 1.5rem;
      background: #131a22;
      border: 1px solid #232c36;
      border-radius: 12px;
    }

    .card h3 {
      margin-top: 0;
    }

    code {
      padding: 0.1rem 0.35rem;
      background: #1c2530;
      border-radius: 4px;
    }

    pre {
      overflow-x: auto;
      padding: 1rem;
      background: #1c2530;
      border-radius: 8px;
    }

    a {
      color: #4dabf7;
    }

    footer {
      padding: 2rem;
      color: #7a8592;
      font-size: 0.9rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <header class="hero">
    <h1>DevOps Bootcamp Project</h1>
    <p>Generated documentation site synced from README.md</p>
  </header>

  <main>
    ${syncedContent}
  </main>

  <footer>
    <p>Auto-generated by the documentation sync pipeline.</p>
  </footer>
</body>
</html>
`;
}

function decodeHtml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function dedentCodeBlock(value) {
  const lines = value
    .replace(/^\n+|\n+$/g, "")
    .split("\n");

  const indentation = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^\s*/)[0].length);

  const minimumIndent =
    indentation.length > 0 ? Math.min(...indentation) : 0;

  return lines.map((line) => line.slice(minimumIndent)).join("\n");
}

function htmlBodyToMarkdown(html) {
  let output = html;

  output = output.replace(
    /<h4>([\s\S]*?)<\/h4>/g,
    (_, text) => `### ${decodeHtml(text.trim())}\n`
  );

  output = output.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (_, code) => `\`\`\`\n${dedentCodeBlock(decodeHtml(code))}\n\`\`\`\n`
  );

  output = output.replace(
    /<ul>([\s\S]*?)<\/ul>/g,
    (_, list) => {
      const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)]
        .map((item) => `- ${decodeHtml(item[1].trim())}`);

      return `${items.join("\n")}\n`;
    }
  );

  output = output.replace(
    /<p>([\s\S]*?)<\/p>/g,
    (_, text) => `${decodeHtml(text.trim())}\n`
  );

  output = output.replace(
    /<code>([\s\S]*?)<\/code>/g,
    (_, text) => `\`${decodeHtml(text)}\``
  );

  output = output.replace(
    /<strong>([\s\S]*?)<\/strong>/g,
    (_, text) => `**${decodeHtml(text)}**`
  );

  output = output.replace(
    /<a href="([^"]+)">([\s\S]*?)<\/a>/g,
    (_, url, text) => `[${decodeHtml(text)}](${url})`
  );

  return output.trim();
}

function parseIndexCards(html) {
  const start = html.indexOf(syncStart);
  const end = html.indexOf(syncEnd);

  if (start === -1 || end === -1) {
    return [];
  }

  const content = html.slice(start + syncStart.length, end);
  const articlePattern = /<article class="card">([\s\S]*?)<\/article>/g;
  const cards = [];

  let match;

  while ((match = articlePattern.exec(content)) !== null) {
    const cardHtml = match[1];
    const heading = cardHtml.match(/<h3>([\s\S]*?)<\/h3>/);

    const title = heading
      ? decodeHtml(heading[1].trim())
      : "Untitled";

    const body = cardHtml
      .replace(/<h3>[\s\S]*?<\/h3>/, "")
      .trim();

    cards.push({
      title,
      body: htmlBodyToMarkdown(body)
    });
  }

  return cards;
}

function buildReadme(existingReadme, html) {
  const cards = parseIndexCards(html);

  const sections = cards
    .map((card) => `## ${card.title}\n\n${card.body}\n`)
    .join("\n");

  if (existingReadme) {
    const firstHeading = existingReadme.search(/^##\s+/m);

    const preamble =
      firstHeading === -1
        ? `${existingReadme.trimEnd()}\n\n`
        : existingReadme.slice(0, firstHeading);

    return preamble + sections;
  }

  return `# DevOps Bootcamp Project\n\n${sections}`;
}

function main() {
  const readme = readFile(readmePath);
  const index = readFile(indexPath);

  if (!readme && !index) {
    console.error("Neither README.md nor index.html exists.");
    process.exit(1);
  }

  const readmeTime = readme ? lastChangeTime(readmePath) : -1;
  const indexTime = index ? lastChangeTime(indexPath) : -1;

  let updatedReadme = readme;
  let updatedIndex = index;
  let direction;

  if (readme && (!index || readmeTime >= indexTime)) {
    direction = "README.md -> index.html";
    updatedIndex = buildIndexHtml(index, readme);
  } else {
    direction = "index.html -> README.md";
    updatedReadme = buildReadme(readme, index);
  }

  const readmeChanged = updatedReadme !== readme;
  const indexChanged = updatedIndex !== index;

  console.log(`Sync direction: ${direction}`);
  console.log(`README.md changed: ${readmeChanged}`);
  console.log(`index.html changed: ${indexChanged}`);

  if (!write) {
    console.log("\nDry run only. Re-run with --write to persist changes.");
    return;
  }

  if (readmeChanged && updatedReadme !== null) {
    writeFileSync(readmePath, updatedReadme, "utf8");
    console.log(`Wrote ${readmePath}`);
  }

  if (indexChanged && updatedIndex !== null) {
    writeFileSync(indexPath, updatedIndex, "utf8");
    console.log(`Wrote ${indexPath}`);
  }
}

main();
