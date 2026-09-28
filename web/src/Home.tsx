import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CodeXml,
  Command,
  Download,
  FileText,
  Fingerprint,
  Laptop,
  LockKeyhole,
  Monitor,
  Plus,
  Radio,
  ShieldCheck,
  Smartphone,
  Terminal,
  Wifi,
} from "lucide-react";
import { t, legalURL } from "./i18n";
import { PageLink } from "./navigation";
import site from "../site.config.json";
import { macRelease } from "./downloads";

const repository = site.githubUrl;
const documentation = repository
  ? `${repository}/blob/main/docs/${encodeURIComponent("自部署.md")}`
  : null;
const installation = repository
  ? `${repository}/blob/main/ios/README.md`
  : null;
const macDownload = macRelease.url;

function ProductPreview() {
  return (
    <div
      className="product-preview"
      aria-label={t("手机与网页同步笔记的界面示意")}
    >
      <div className="preview-label">
        <span className="tiny-dot" />
        {t("一个想法，两个屏幕。")}
      </div>
      <div className="browser-preview">
        <div className="preview-browser-bar">
          <div className="window-dots">
            <i />
            <i />
            <i />
          </div>
          <span>
            <LockKeyhole size={10} /> NoteBaton / Note
          </span>
          <span className="preview-live">
            <i /> {t("已连接演示")}
          </span>
        </div>
        <div className="preview-browser-body">
          <div className="preview-sidebar">
            <span className="preview-logo">
              N<span>↗</span>
            </span>
            <FileText size={18} />
            <Command size={17} />
            <span className="sidebar-bottom">
              <ShieldCheck size={17} />
            </span>
          </div>
          <div className="preview-editor">
            <div className="preview-note-meta">
              <span>{t("今天的灵感")}</span>
              <span>Markdown</span>
            </div>
            <h3>{t("给想法一个去处。")}</h3>
            <p>{t("在路上记下，回到桌前继续。")}</p>
            <div className="preview-checklist">
              <p>
                <span className="demo-checkbox checked">
                  <Check size={11} />
                </span>
                {t("捕捉一闪而过的灵感")}
              </p>
              <p>
                <span className="demo-checkbox checked">
                  <Check size={11} />
                </span>
                {t("留住值得再读的链接")}
              </p>
              <p>
                <span className="demo-checkbox" />
                {t("把下一句话写完")}
              </p>
            </div>
            <div className="preview-quote">
              {t("想法自由流动，笔记由你保管。")}
            </div>
            <div className="preview-save">
              <CheckCheck size={13} />
              {t("已保存到设备")}
            </div>
          </div>
        </div>
      </div>
      <div className="phone-preview">
        <div className="phone-island" />
        <div className="phone-status">
          <span>9:41</span>
          <Wifi size={12} />
        </div>
        <div className="phone-content">
          <div className="phone-heading">
            <strong>{t("我的笔记")}</strong>
            <Plus size={16} />
          </div>
          <p className="phone-caption">{t("随手记，接着用")}</p>
          <div className="phone-note">
            <span className="phone-note-date">{t("刚刚")}</span>
            <h4>{t("给想法一个去处。")}</h4>
            <p>{t("在路上记下，回到桌前继续。")}</p>
            <div className="phone-note-lines">
              <i />
              <i />
            </div>
            <span className="phone-note-saved">
              <Check size={10} />
              {t("本机已保存")}
            </span>
          </div>
          <div className="phone-note mini">
            <span>↗</span>
            <span>{t("下一次旅行的灵感")}</span>
          </div>
          <div className="phone-compose">
            <Plus size={13} />
            {t("新建笔记")}
          </div>
        </div>
        <div className="phone-home-indicator" />
      </div>
      <div className="encryption-stamp">
        <ShieldCheck size={19} />
        <span>
          <strong>{t("端到端加密")}</strong>
          <small>{t("只有你的设备能解密")}</small>
        </span>
      </div>
      <span className="preview-caption">
        {t("界面示意 · 正文保存在你的设备")}
      </span>
    </div>
  );
}

export function Home() {
  return (
    <main className="home-page">
      <section
        className="home-hero content-width"
        aria-labelledby="home-heading"
      >
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span />
            {t("你的笔记，不止一个屏幕。")}
          </span>
          <h1 id="home-heading">
            {t("手机里的灵感，")}
            <br />
            <em>{t("电脑上接着写。")}</em>
          </h1>
          <p className="hero-description">
            {t(
              "NoteBaton 接力，让文字、链接和 Markdown 在 iPhone、Mac 与浏览器之间同步。无需注册，原生设备各有本地副本。",
            )}
          </p>
          <div className="hero-actions">
            <PageLink href="/note" className="primary hero-button">
              {t("打开 Note")}
              <ArrowRight size={18} />
            </PageLink>
            <a href={macDownload} className="hero-secondary" download>
              <Download size={17} />
              {t("下载 macOS 版")}
            </a>
          </div>
          <p className="mac-download-note">
            {t(
              "macOS 14 或更高版本 · Apple 芯片与 Intel · App 已通过 Apple 公证",
            )}
          </p>
          <p className="mac-install-note">
            {t("打开 DMG，将 NoteBaton 拖入 Applications（应用程序）即可安装。")}
            <span>v{macRelease.version} · DMG</span>
          </p>
          <p className="hero-footnote">
            <Smartphone size={14} /> iPhone <span>+</span> Mac <span>+</span>
            <Monitor size={14} />
            {t("任何电脑浏览器")}
          </p>
        </div>
        <ProductPreview />
      </section>

      <div className="trust-strip content-width" aria-label={t("产品特点")}>
        <span>
          <Smartphone size={18} />
          {t("笔记本机保存")}
        </span>
        <span>
          <ShieldCheck size={18} />
          {t("端到端加密")}
        </span>
        <span>
          <Fingerprint size={18} />
          {t("无需注册账号")}
        </span>
        <span>
          <CodeXml size={18} />
          {t("MIT 许可 · 支持自部署")}
        </span>
      </div>

      <section
        className="home-section content-width"
        id="how-it-works"
        aria-labelledby="how-heading"
      >
        <div className="section-intro">
          <span className="section-kicker">01 / {t("轻松接力")}</span>
          <h2 id="how-heading">{t("从随手记下，到继续完成。")}</h2>
          <p>{t("不再给自己发消息，也不用在设备之间反复复制。")}</p>
        </div>
        <div className="workflow-grid">
          <article>
            <span className="step-number">01</span>
            <div className="workflow-icon">
              <Smartphone size={25} />
            </div>
            <h3>{t("在手机记下")}</h3>
            <p>
              {t(
                "写一段文字，粘贴一个链接，或保存剪贴板里的灵感。输入时自动保存，不必惦记保存按钮。",
            )}
            </p>
            {installation && (
              <>
                <a
                  href={installation}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("iPhone 安装说明")}
                  <ArrowUpRight size={14} />
                </a>
                <a href={macDownload} download>
                  {t("下载 macOS 版")}
                  <Download size={14} />
                </a>
                <a
                  href={legalURL("support")}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("macOS 安装说明")}
                  <ArrowUpRight size={14} />
                </a>
              </>
            )}
          </article>
          <article>
            <span className="step-number">02</span>
            <div className="workflow-icon">
              <Radio size={25} />
            </div>
            <h3>{t("扫码，让设备相遇")}</h3>
            <p>
              {t(
                "打开 Note，在 App 中扫描网页二维码，核对网址后授权。无需账号，也不需要记住另一组密码。",
              )}
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <div className="workflow-icon">
              <Laptop size={25} />
            </div>
            <h3>{t("换个屏幕，接着写")}</h3>
            <p>
              {t(
                "让已配对的 iPhone App 保持前台，或 Mac App 保持运行，即可在网页阅读和编辑。原生设备间自动同步，支持离线编辑。",
              )}
            </p>
          </article>
        </div>
      </section>

      <section className="privacy-section" aria-labelledby="privacy-heading">
        <div className="content-width privacy-layout">
          <div className="privacy-copy">
            <span className="section-kicker">02 / {t("隐私，是默认设置")}</span>
            <h2 id="privacy-heading">
              {t("笔记经过网络，")}
              <br />
              {t("所有权留在你手里。")}
            </h2>
            <p>
              {t(
                "正文保存在已同步的 iPhone 与 Mac。内容在设备上加密，中转服务只转发密文，没有笔记解密密钥。",
              )}
            </p>
            <div className="privacy-detail">
              <ShieldCheck size={20} />
              <span>
                <strong>AES-256-GCM</strong>
                <small>{t("端到端加密，配对后才同步。")}</small>
              </span>
            </div>
          </div>
          <div className="privacy-map">
            <div className="data-flow">
              <div className="flow-endpoint">
                <Smartphone size={28} />
                <strong>{t("你的设备")}</strong>
                <span>{t("保存 · 加密")}</span>
              </div>
              <span className="flow-wire">
                <i />
                <LockKeyhole size={14} />
                <i />
              </span>
              <div className="flow-relay">
                <Radio size={23} />
                <strong>{t("中转服务")}</strong>
                <span>{t("仅转发密文")}</span>
              </div>
              <span className="flow-wire">
                <i />
                <LockKeyhole size={14} />
                <i />
              </span>
              <div className="flow-endpoint">
                <Monitor size={28} />
                <strong>{t("你的浏览器")}</strong>
                <span>{t("解密 · 编辑")}</span>
              </div>
            </div>
            <div className="privacy-facts">
              <p>
                <Check size={16} />
                {t("无广告，无需提交邮箱或手机号")}
              </p>
              <p>
                <Check size={16} />
                {t("设备授权，可随时撤销配对")}
              </p>
              <p>
                <Check size={16} />
                {t("无需把笔记交给一个云端账号")}
              </p>
            </div>
            <p className="privacy-context">
              {t(
                "只配对可信网站与自己的设备。已配对设备离线时，网页仍可阅读本页已加载的笔记。",
              )}
            </p>
          </div>
        </div>
      </section>

      <section
        className="home-section content-width ownership-section"
        aria-labelledby="ownership-heading"
      >
        <div className="section-intro">
          <span className="section-kicker">03 / {t("选择权，也属于你")}</span>
          <h2 id="ownership-heading">{t("用我们的服务，或搭建你自己的。")}</h2>
          <p>{t("同一个 App，连接你选择的网站。你的工作方式，由你决定。")}</p>
        </div>
        <div className="ownership-grid">
          <article className="source-card">
            <span className="card-icon">
              <CodeXml size={25} />
            </span>
            <h3>{t("为开源而构建")}</h3>
            <p>
              {t(
                "采用 MIT 许可，支持修改、分发与自部署。项目仓库即将公开，也欢迎一起让接力变得更好。",
              )}
            </p>
            {repository && (
              <a
                href={repository}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-link"
              >
                {t("在 GitHub 查看项目")}
                <ArrowUpRight size={16} />
              </a>
            )}
            <span className="license-badge">MIT LICENSE</span>
          </article>
          <article className="deploy-card">
            <div className="deploy-copy">
              <span className="card-icon">
                <Terminal size={25} />
              </span>
              <h3>{t("部署到你的 Cloudflare")}</h3>
              <p>
                {t(
                  "使用你自己的域名和 Cloudflare 账号，掌握服务的运行方式。扫码连接自己的部署，无需重新编译 App。",
                )}
              </p>
            </div>
            <div className="deploy-code" aria-label={t("自部署命令示例")}>
              <div>
                <span className="terminal-dot" />
                {t("克隆完整仓库后")}
              </div>
              <pre>
                <code>
                  {
                    "cd web\nnpm ci\nnpx wrangler login\nnpm run deploy -- --name my-notebaton"
                  }
                </code>
              </pre>
            </div>
            {documentation && (
              <a
                href={documentation}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-link"
              >
                {t("阅读自部署指南")}
                <ArrowUpRight size={16} />
              </a>
            )}
          </article>
        </div>
      </section>

      <section
        className="faq-section content-width"
        aria-labelledby="faq-heading"
      >
        <div>
          <span className="section-kicker">{t("开始之前")}</span>
          <h2 id="faq-heading">{t("你可能想了解")}</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>
              {t("需要注册账号或登录吗？")}
              <Plus size={18} />
            </summary>
            <p>
              {t(
                "不需要。iPhone 和 Mac 各自保存笔记。网页或新设备展示配对码，由你在已有设备确认授权。",
              )}
            </p>
          </details>
          <details>
            <summary>
              {t("已配对设备离线后，网页还能用吗？")}
              <Plus size={18} />
            </summary>
            <p>
              {t(
                "可以阅读当前页面已加载内容。保存修改和加载更多需要网页配对的设备在线：iPhone App 在前台，或 Mac App 保持运行。未同步网页草稿仅保留在本页。",
              )}
            </p>
          </details>
          <details>
            <summary>
              {t("现在如何安装 iPhone App？")}
              <Plus size={18} />
            </summary>
            <p>
              {t(
                "目前通过 Xcode 构建安装，尚未上架 App Store 或 TestFlight。安装后可以先使用本机笔记，再选择网站配对。",
              )}
              {installation && (
                <>
                  {" "}
                  <a
                    href={installation}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("查看安装说明")} ↗
                  </a>
                </>
              )}
            </p>
          </details>
          <details>
            <summary>
              {t("笔记有云备份吗？")}
              <Plus size={18} />
            </summary>
            <p>
              {t(
                "没有云备份。已同步的原生设备各有副本；若丢失所有副本，笔记无法找回。删除也会传播，请另行备份重要内容。",
              )}
            </p>
          </details>
        </div>
      </section>

      <section className="home-cta content-width">
        <div>
          <span className="section-kicker">{t("想法不必停在一个屏幕。")}</span>
          <h2>{t("下一句话，在这里继续。")}</h2>
        </div>
        <PageLink href="/note" className="primary hero-button">
          {t("打开 Note")}
          <ArrowRight size={18} />
        </PageLink>
      </section>
    </main>
  );
}
