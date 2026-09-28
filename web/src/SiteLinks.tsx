import { t, legalURL } from "./i18n";
import { CodeXml } from "lucide-react";
import site from "../site.config.json";

export function ProjectLink() {
  const label = (
    <>
      <CodeXml size={17} aria-hidden="true" />
      <span>GitHub</span>
    </>
  );
  return site.githubUrl ? (
    <a
      className="project-link"
      href={site.githubUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  ) : (
    <span className="project-link project-pending" aria-disabled="true">
      {label}
      <small>{t("即将开放")}</small>
    </span>
  );
}

export function SiteLinks() {
  return (
    <footer className="site-footer">
      <ProjectLink />
      <nav aria-label={t("隐私与条款")}>
        <a href={legalURL("privacy")} target="_blank" rel="noopener noreferrer">
          {t("网站隐私政策")}
        </a>
        <a href={legalURL("terms")} target="_blank" rel="noopener noreferrer">
          {t("网站使用条款")}
        </a>
        <a
          href={legalURL("app-privacy")}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("App 隐私政策")}
        </a>
        <a
          href={legalURL("support")}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("支持与帮助")}
        </a>
        <a
          href="/third-party-notices.txt"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("开源许可")}
        </a>
      </nav>
    </footer>
  );
}
