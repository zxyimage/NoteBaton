import { useEffect, useState } from "react";
import { t, useLanguage, legalURL } from "./i18n";
import { Home } from "./Home";
import { DownloadPage } from "./DownloadPage";
import { SiteHeader } from "./SiteHeader";
import { SiteLinks } from "./SiteLinks";
import { usePage } from "./navigation";
import NoteApp from "./App";

function PairingNotice() {
  return (
    <p className="pair-consent">
      {t("配对即表示你同意")}{" "}
      <a
        href={legalURL("terms")}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("网站使用条款")}
      </a>
      {t("。请阅读")}{" "}
      <a
        href={legalURL("privacy")}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("网站隐私政策")}
      </a>
      {t("。")}
    </p>
  );
}

export default function SiteApp() {
  const language = useLanguage();
  const page = usePage();
  const [noteVisited, setNoteVisited] = useState(page === "note");
  useEffect(() => {
    if (page === "note") setNoteVisited(true);
  }, [page]);
  useEffect(() => {
    document.title =
      page === "note"
        ? "Note · NoteBaton"
        : page === "download"
          ? `${t("下载")} · NoteBaton`
        : language === "zh-CN"
          ? "NoteBaton 接力 · 手机里的灵感，电脑上接着写"
          : "NoteBaton · Pick up where inspiration strikes";
  }, [page, language]);
  return (
    <>
      <SiteHeader page={page} />
      <div id="main-content" tabIndex={-1}>
        {page === "home" && <Home />}
        {page === "download" && <DownloadPage />}
        <div hidden={page !== "note"} className="note-surface">
          {(noteVisited || page === "note") && <NoteApp pairingNotice={<PairingNotice />} />}
        </div>
      </div>
      <SiteLinks />
    </>
  );
}
