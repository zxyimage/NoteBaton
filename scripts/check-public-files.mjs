import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const forbidden = /(^|\/)(\.private|node_modules|dist|\.wrangler|xcuserdata|DerivedData)(\/|$)|\.(xcarchive|app|dSYM)(\/|$)|(^|\/)(\.dev\.vars(?:\..*)?|\.env(?:\..*)?|\.local-credentials\.json|\.secrets\.json|\.deploy(?:\.site)?\.local\.json|site\.config\.local\.json)$|\.local\.xcconfig$|web\/public\/downloads\/|\.(p12|p8|pem|key|cer|mobileprovision|provisionprofile|developerprofile|xcuserstate|ipa|dmg(?:\.sha256)?|pkg|zip|sqlite(?:-[^/]*)?|db(?:-[^/]*)?)$/i;
const patterns = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
];
const xcodeConfig = /\.(pbxproj|xcconfig|plist|entitlements|xcscheme|xcsettings|xcworkspacedata)(\.example)?$|(^|\/)project\.ya?ml$/i;
const privateSigning = [
  /\b(?:DEVELOPMENT_TEAM|DevelopmentTeam|TeamIdentifier|teamID)\b[\s"'=:\->]*(?:<\/key>\s*(?:<array>\s*)?<string>)?["']?[A-Z0-9]{10}\b/,
  /\b(?:Apple Development|Apple Distribution|iPhone Developer|iPhone Distribution|Developer ID Application|Developer ID Installer):\s*[^\s"';<]/,
  /\bCODE_SIGN_IDENTITY\b[^\r\n=:]*[=:]\s*["']?[A-Fa-f0-9]{40}\b/,
  /\/Users\/(?!Shared\/)[^/\s"'<>]+\//,
];
const personalSetting = /(?:\b(PROVISIONING_PROFILE(?:_SPECIFIER)?|ORGANIZATIONNAME|APPLE_ID|AppleID)\b\s*[=:]\s*([^\r\n;]+)|<key>(provisioningProfiles|AppleID|ORGANIZATIONNAME)<\/key>\s*<(?:string|dict)>([\s\S]*?)<\/(?:string|dict)>)/g;
const placeholder = /^(?:YOUR_[A-Z_]+|\$\([^)]+\)|\$\{[^}]+\})$/;
const failures = new Set();
for (const file of paths) {
  if (forbidden.test(file) && !file.endsWith('.example')) failures.add(file);
  let data;
  try { data = readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (patterns.some(pattern => pattern.test(data))) failures.add(file);
  if (xcodeConfig.test(file)) {
    if (privateSigning.some(pattern => pattern.test(data))) failures.add(file);
    for (const match of data.matchAll(personalSetting)) {
      const value = (match[2] ?? match[4]).split('//')[0].replace(/^\s*["']|["']\s*$/g, '').trim();
      if (value && !placeholder.test(value)) failures.add(file);
    }
  }
  if (file === 'web/site.config.json') {
    const config = JSON.parse(data);
    for (const key of ['webOperatorName', 'webPrivacyEmail', 'appDeveloperName', 'appPrivacyEmail']) {
      if (config[key] !== null) failures.add(file);
    }
  }
}
if (failures.size) {
  console.error('Potential private files or credentials found (values omitted):\n' + [...failures].join('\n'));
  process.exit(1);
}
console.log(`Public-file checks passed for ${paths.length} public files. This pattern check is not a full secret or security audit.`);
