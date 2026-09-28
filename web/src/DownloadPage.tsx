import { ArrowRight, ArrowUpRight, Download, Globe, Laptop, Smartphone } from "lucide-react";
import { iosAppStoreUrl, macRelease } from "./downloads";
import { legalURL, t } from "./i18n";
import { PageLink } from "./navigation";
import "./download.css";

export function DownloadPage() {
  return (
    <main className="download-page content-width" aria-labelledby="download-heading">
      <div className="download-heading">
        <span className="download-eyebrow">iOS · macOS · Web</span>
        <h1 id="download-heading">{t("下载 NoteBaton")}</h1>
        <p>{t("选择你的设备，让笔记在 iPhone、Mac 和浏览器之间接力。")}</p>
      </div>

      <div className="download-grid">
        <article className="download-card" aria-labelledby="ios-download-heading">
          <div className="download-platform-icon"><Smartphone size={30} aria-hidden="true" /></div>
          <h2 id="ios-download-heading">iOS</h2>
          <p className="download-description">{t("随手记录文字、链接和灵感，离线也能继续写。")}</p>
          <p className="download-requirement">{t("iPhone · iOS 17 或更高版本")}</p>
          <div className="download-card-bottom">
            {iosAppStoreUrl ? (
              <a className="download-action" href={iosAppStoreUrl} target="_blank" rel="noopener noreferrer">
                {t("在 App Store 下载")}<ArrowUpRight size={17} aria-hidden="true" />
              </a>
            ) : (
              <button className="download-action" disabled>{t("即将上线")}</button>
            )}
            <p className="download-caption">{iosAppStoreUrl ? t("从 App Store 安装 iPhone 客户端。") : t("上架后可通过 App Store 下载。")}</p>
          </div>
        </article>

        <article className="download-card download-card-mac" aria-labelledby="mac-download-heading">
          <div className="download-platform-icon"><Laptop size={30} aria-hidden="true" /></div>
          <h2 id="mac-download-heading">macOS</h2>
          <p className="download-description">{t("在 Mac 上专注书写，菜单栏常驻，随时接着写。")}</p>
          <p className="download-requirement">{t("macOS 14+ · Apple 芯片与 Intel")}</p>
          <div className="download-card-bottom">
            <a className="download-action" href={macRelease.url} download>
              {t("下载 macOS 版")}<Download size={17} aria-hidden="true" />
            </a>
            <p className="download-caption">v{macRelease.version} · DMG · {t("App 已通过 Apple 公证")}</p>
          </div>
        </article>

        <article className="download-card" aria-labelledby="web-download-heading">
          <div className="download-platform-icon"><Globe size={30} aria-hidden="true" /></div>
          <h2 id="web-download-heading">Web</h2>
          <p className="download-description">{t("打开浏览器，与 iPhone 或 Mac 配对，就能阅读和编辑笔记。")}</p>
          <p className="download-requirement">{t("无需安装 · 使用现代浏览器")}</p>
          <div className="download-card-bottom">
            <PageLink className="download-action" href="/note">
              {t("打开网页版")}<ArrowRight size={17} aria-hidden="true" />
            </PageLink>
            <p className="download-caption">{t("同步时，请保持已配对的 App 在线。")}</p>
          </div>
        </article>
      </div>

      <aside className="download-install" aria-labelledby="mac-install-heading">
        <div>
          <h2 id="mac-install-heading">{t("Mac 安装，只需拖一下。")}</h2>
          <p>{t("打开 DMG，将 NoteBaton 拖入 Applications（应用程序）即可安装。")}</p>
        </div>
        <a href={legalURL("support")} target="_blank" rel="noopener noreferrer">
          {t("查看安装说明")}<ArrowUpRight size={16} aria-hidden="true" />
        </a>
      </aside>
    </main>
  );
}
