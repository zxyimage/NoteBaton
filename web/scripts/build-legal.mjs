import { readFile, writeFile, mkdir } from "node:fs/promises";
import MarkdownIt from "markdown-it";

const root = new URL("../", import.meta.url);
const config = JSON.parse(
  await readFile(new URL("site.config.json", root), "utf8"),
);
const check = process.argv.includes("--check");
const requireContact = process.argv.includes("--require-contact");
const escapeMarkdown = (value) =>
  value.replace(/[\\`*_{}[\]()#+.!<>|]/g, "\\$&");
const html = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
for (const key of [
  "webOperatorName",
  "webPrivacyEmail",
  "appDeveloperName",
  "appPrivacyEmail",
]) {
  if (
    config[key] !== null &&
    (typeof config[key] !== "string" ||
      !config[key].trim() ||
      /[\r\n]/.test(config[key]))
  )
    throw new Error(`Invalid ${key} in site.config.json`);
}
for (const key of ["webPrivacyEmail", "appPrivacyEmail"]) {
  if (
    config[key] &&
    !/^[^\s<>"()]+@[^\s<>"()]+\.[^\s<>"()]+$/.test(config[key])
  )
    throw new Error(`Invalid ${key} in site.config.json`);
}
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(config.effectiveDate) ||
  !Number.isFinite(Date.parse(config.effectiveDate))
)
  throw new Error("Invalid effectiveDate in site.config.json");
if (config.githubUrl !== null) {
  const url = new URL(config.githubUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/[^/]+\/[^/]+\/?$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error("githubUrl must be a GitHub repository HTTPS URL, or null");
}
const webReady = !!config.webPrivacyEmail;
const appReady = !!(config.appDeveloperName && config.appPrivacyEmail);
if (requireContact && (!webReady || !appReady))
  throw new Error(
    "Complete the Web privacy email and App developer name and privacy email in site.config.json before publishing policies or submitting to the App Store.",
  );

const contact = (email) =>
  email
    ? `[${escapeMarkdown(email)}](mailto:${encodeURIComponent(email)})`
    : "**Privacy contact details pending**";
const replacements = {
  EFFECTIVE_DATE: new Date(
    config.effectiveDate + "T00:00:00Z",
  ).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }),
  WEB_OPERATOR: escapeMarkdown(
    config.webOperatorName || "Website operator details pending",
  ),
  WEB_CONTACT: contact(config.webPrivacyEmail),
  APP_DEVELOPER: escapeMarkdown(
    config.appDeveloperName || "App developer details pending",
  ),
  APP_CONTACT: contact(config.appPrivacyEmail),
};
const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
});
const pages = [
  {
    slug: "privacy",
    title: "Web Privacy Policy",
    scope: "WEB",
    ready: webReady,
  },
  { slug: "terms", title: "Web Terms of Use", scope: "WEB", ready: webReady },
  {
    slug: "app-privacy",
    title: "App Privacy Policy",
    scope: "iOS APP",
    ready: appReady,
  },
  {
    slug: "support",
    title: "App Support",
    scope: "APP SUPPORT",
    ready: appReady,
  },
];
async function output(path, value) {
  const url = new URL(path, root);
  if (check) {
    if ((await readFile(url, "utf8").catch(() => "")) !== value)
      throw new Error(
        `Generated policy is stale: ${path}. Run npm run build:legal.`,
      );
  } else {
    await mkdir(new URL("./", url), { recursive: true });
    await writeFile(url, value);
  }
}
for (const locale of ["en", "zh-CN"]) {
  const zh = locale === "zh-CN";
  const titles = zh
    ? ["网站隐私政策", "网站使用条款", "App 隐私政策", "App 支持"]
    : pages.map((page) => page.title);
  const pageURL = (slug) => `/${slug}/${zh ? "zh-CN/" : ""}`;
  const project = config.githubUrl
    ? `<a href="${html(config.githubUrl)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>`
    : `<span class="project-pending" aria-disabled="true">GitHub <span>${zh ? "即将开放" : "Coming soon"}</span></span>`;
  const fields = zh
    ? {
        ...replacements,
        EFFECTIVE_DATE: new Date(
          config.effectiveDate + "T00:00:00Z",
        ).toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        }),
        WEB_OPERATOR: escapeMarkdown(
          config.webOperatorName || "网站运营者信息待填写",
        ),
        WEB_CONTACT: config.webPrivacyEmail
          ? contact(config.webPrivacyEmail)
          : "**隐私联系方式待填写**",
        APP_DEVELOPER: escapeMarkdown(
          config.appDeveloperName || "App 开发者信息待填写",
        ),
        APP_CONTACT: config.appPrivacyEmail
          ? contact(config.appPrivacyEmail)
          : "**隐私联系方式待填写**",
      }
    : replacements;
  for (const [index, page] of pages.entries()) {
    const title = titles[index];
    let source = await readFile(
      new URL(`legal/${zh ? "zh-CN/" : ""}${page.slug}.md`, root),
      "utf8",
    );
    source = source.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
      if (!(key in fields)) throw new Error(`Unknown policy field: ${key}`);
      return fields[key];
    });
    const draftTitle = zh
      ? page.slug === "support"
        ? "支持页草稿"
        : "政策草稿"
      : page.slug === "support"
        ? "Draft support page"
        : "Draft policy";
    const draftDescription = zh
      ? "发布主体及公开联系方式待填写；此版本尚未准备好正式发布或提交 App Store。"
      : "Publisher and public contact details are pending. This version is not ready for publication or App Store submission.";
    const draft = page.ready
      ? ""
      : `<aside class="draft-notice" role="note"><strong>${draftTitle}</strong><br>${draftDescription}</aside>`;
    const links = pages
      .map(
        (item, i) =>
          `<a href="${pageURL(item.slug)}"${page.slug === item.slug ? ' aria-current="page"' : ""}>${titles[i]}</a>`,
      )
      .join("\n");
    const switcher = `<nav class="language-links" aria-label="${zh ? "语言" : "Language"}"><a href="/${page.slug}/zh-CN/" lang="zh-CN"${zh ? ' aria-current="page"' : ""}>简体中文</a> · <a href="/${page.slug}/" lang="en"${zh ? "" : ' aria-current="page"'}>English</a></nav>`;
    await output(
      `public${pageURL(page.slug)}index.html`,
      `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${title} · NoteBaton"><meta name="color-scheme" content="light"><title>${title} · NoteBaton</title>${page.ready ? "" : '<meta name="robots" content="noindex">'}<link rel="alternate" hreflang="en" href="/${page.slug}/"><link rel="alternate" hreflang="zh-CN" href="/${page.slug}/zh-CN/"><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/legal.css"></head>
<body><a class="skip-link" href="#policy">${zh ? "跳转到正文" : "Skip to policy"}</a><header class="site-header"><a class="brand" href="/">${zh ? "接力" : "NoteBaton"} <span>${zh ? "NoteBaton" : "Relay Clipboard"}</span></a>${switcher}${project}</header>
<div class="policy-layout"><nav aria-label="${zh ? "法律文档" : "Legal documents"}"><p class="eyebrow">${zh ? "隐私与条款" : "PRIVACY & TERMS"}</p>${links}<a href="/third-party-notices.txt">${zh ? "第三方开源许可" : "Third-party notices"}</a><a class="back-link" href="/">← ${zh ? "返回笔记" : "Back to notes"}</a></nav>
<main id="policy" tabindex="-1"><p class="eyebrow">${zh ? (page.scope === "WEB" ? "网站" : "iOS APP") : page.scope}</p>${draft}<article>${markdown.render(source)}</article></main></div>
<footer>NoteBaton · ${zh ? "笔记保存在手机，同步使用端到端加密。" : "Notes on your phone. End-to-end encrypted sync."}</footer></body></html>\n`,
    );
    if (page.slug === "app-privacy") {
      const warning = page.ready
        ? ""
        : zh
          ? "> **政策草稿：** 开发者及隐私联系方式待填写。提交 App Store 前请补充。\n\n"
          : "> **Draft policy:** Developer and privacy contact details are pending. Complete them before App Store submission.\n\n";
      await output(
        `../ios/Clipboard/Legal/app-privacy${zh ? ".zh-CN" : ""}.md`,
        warning + source,
      );
    }
  }
}
console.log(
  `Legal pages ${check ? "verified" : "generated"}. Web contact: ${webReady ? "configured" : "pending"}; App contact: ${appReady ? "configured" : "pending"}.`,
);
