import { ArrowUpRight, Clipboard, Download } from "lucide-react";
import { LanguagePicker, t } from "./i18n";
import { PageLink, type Page } from "./navigation";
import site from "../site.config.json";

export function SiteHeader({ page }: { page: Page }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("跳转到主要内容")}
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <PageLink
            href="/"
            className="site-brand"
            aria-label={t("NoteBaton 首页")}
          >
            <span className="brand-mark">
              <Clipboard size={21} strokeWidth={1.8} />
            </span>
            <span>
              NoteBaton<span className="brand-cn">{t("接力品牌副标")}</span>
            </span>
          </PageLink>
          <nav className="primary-nav" aria-label={t("主导航")}>
            <PageLink
              href="/"
              aria-current={page === "home" ? "page" : undefined}
            >
              {t("首页")}
            </PageLink>
            <PageLink
              href="/note"
              aria-current={page === "note" ? "page" : undefined}
            >
              Note
            </PageLink>
            <PageLink
              href="/download"
              aria-current={page === "download" ? "page" : undefined}
            >
              <Download size={15} aria-hidden="true" />
              {t("下载")}
            </PageLink>
            {site.githubUrl && (
              <a
                href={site.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
          </nav>
          <div className="site-language">
            <LanguagePicker />
          </div>
        </div>
      </header>
    </>
  );
}
