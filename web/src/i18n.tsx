import { useSyncExternalStore } from "react";
import { detectLanguage, translate, type Language } from "./localization";

const storageKey = "notebaton.language";
const listeners = new Set<() => void>();
function initialLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    /* Storage can be disabled. */
  }
  return detectLanguage(saved, navigator.languages);
}
let language = initialLanguage();
export function getLanguage(): Language {
  return language;
}
export function t(message: string): string {
  return translate(message, language);
}
function updateDocument() {
  document.documentElement.lang = language;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      "content",
      t(
        "用手机连接这个网页，在电脑上接着阅读和书写。无需注册账号，笔记由你的手机保管。",
      ),
    );
}
export function setLanguage(value: Language) {
  language = value;
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* Keep the choice for this page. */
  }
  updateDocument();
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useLanguage() {
  return useSyncExternalStore(subscribe, getLanguage);
}
export function legalURL(slug: string) {
  return `/${slug}/${language === "zh-CN" ? "zh-CN/" : ""}`;
}
export function LanguagePicker() {
  const value = useLanguage();
  return (
    <label className="language-picker">
      <span className="sr-only">{t("语言")}</span>
      <select
        aria-label={t("语言")}
        value={value}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
window.addEventListener("storage", (event) => {
  if (event.key === storageKey || event.key === null) {
    language = detectLanguage(event.newValue, navigator.languages);
    updateDocument();
    listeners.forEach((listener) => listener());
  }
});
updateDocument();
