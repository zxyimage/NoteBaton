import { useEffect } from "react";
import { Clipboard } from "lucide-react";
import NoteApp from "./App";
import { LanguagePicker, t, useLanguage } from "./i18n";

export default function RelayApp() {
  useLanguage();
  useEffect(() => { document.title = "Note · NoteBaton"; }, []);
  return (
    <>
      <header className="relay-header">
        <div className="brand"><Clipboard size={24} /><strong>NoteBaton</strong></div>
        <LanguagePicker />
      </header>
      <div className="note-surface"><NoteApp /></div>
      <footer className="relay-footer">
        <a href="/third-party-notices.txt" target="_blank" rel="noopener noreferrer">{t("开源许可")}</a>
      </footer>
    </>
  );
}
