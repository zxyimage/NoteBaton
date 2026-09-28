import messages from "../../shared/messages.json";

export type Language = "zh-CN" | "en";
const catalog: Record<string, Record<Language, string>> = {
  ...messages,
};
const reverse = new Map(
  Object.entries(catalog).map(([key, value]) => [value.en, key]),
);
export function registerTranslations(extra: Record<string, Record<Language, string>>) {
  Object.assign(catalog, extra);
  for (const [key, value] of Object.entries(extra)) reverse.set(value.en, key);
}
export function detectLanguage(
  saved: string | null,
  preferred: readonly string[],
): Language {
  if (saved === "zh-CN" || saved === "en") return saved;
  return preferred[0]?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function translate(message: string, locale: Language): string {
  const key = Object.hasOwn(catalog, message) ? message : reverse.get(message);
  return key ? catalog[key][locale] : message;
}
