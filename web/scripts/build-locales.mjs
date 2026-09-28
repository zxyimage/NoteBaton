import { readFile, writeFile, mkdir } from "node:fs/promises";
const catalog = JSON.parse(
  await readFile(
    new URL("../../shared/messages.json", import.meta.url),
    "utf8",
  ),
);
const check = process.argv.includes("--check");
for (const [locale, folder] of [
  ["en", "en"],
  ["zh-CN", "zh-Hans"],
]) {
  const path = new URL(
    `../../ios/Clipboard/${folder}.lproj/Localizable.strings`,
    import.meta.url,
  );
  const content =
    "// Generated from shared/messages.json by npm run build:locales.\n" +
    Object.entries(catalog)
      .map(([key, value]) => {
        if (!value[locale])
          throw new Error(`Missing ${locale} translation: ${key}`);
        return `${JSON.stringify(key)} = ${JSON.stringify(value[locale])};`;
      })
      .join("\n") +
    "\n";
  if (check) {
    if ((await readFile(path, "utf8")) !== content)
      throw new Error(`Stale locale: ${folder}`);
  } else {
    await mkdir(new URL("./", path), { recursive: true });
    await writeFile(path, content);
  }
}
console.log("App translations " + (check ? "verified" : "generated"));
