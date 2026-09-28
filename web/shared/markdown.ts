import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const linkOpen = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noopener noreferrer");
  return linkOpen
    ? linkOpen(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};
// Notes never load third-party images or execute user HTML. This renderer is
// bundled unchanged into the website and the offline iOS WKWebView.
md.renderer.rules.image = (tokens, index) =>
  `<span class="image-placeholder">[图片：${md.utils.escapeHtml(tokens[index].content || "图片链接")}]</span>`;
export function renderMarkdown(text: string) {
  return md.render(text);
}
