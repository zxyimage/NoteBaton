import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../check-public-files.mjs', import.meta.url));
const blankPublisher = { webOperatorName: null, webPrivacyEmail: null, appDeveloperName: null, appPrivacyEmail: null };

function check(files, forceStage = false) {
  const root = mkdtempSync(join(tmpdir(), 'notebaton-public-check-'));
  try {
    execFileSync('git', ['init', '--quiet', root]);
    for (const [name, content] of Object.entries(files)) {
      const path = join(root, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    if (forceStage) execFileSync('git', ['add', '--force', '.'], { cwd: root });
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('public defaults, placeholders and ignored local signing remain usable', () => {
  const result = check({
    '.gitignore': '*.local.xcconfig\n',
    'ios/Config/Signing.local.xcconfig': 'DEVELOPMENT_TEAM = A1B2C3D4E5\n',
    'ios/Config/Signing.local.xcconfig.example': 'DEVELOPMENT_TEAM = YOUR_TEAM_ID\n',
    'ios/Config/Signing.xcconfig': 'DEVELOPMENT_TEAM =\n#include? "Signing.local.xcconfig"\n',
    'ios/App.xcodeproj/project.pbxproj': 'CODE_SIGN_IDENTITY = "Apple Development";\nPROVISIONING_PROFILE_SPECIFIER = "";\n',
    'ios/ExportOptions.plist': '<key>teamID</key><string>$(DEVELOPMENT_TEAM)</string>',
    'web/site.config.json': JSON.stringify(blankPublisher),
  });
  assert.equal(result.status, 0, result.stderr);
});

test('developer identities are detected in Xcode, XcodeGen, and export configurations', () => {
  const fixtures = [
    ['ios/App.xcodeproj/project.pbxproj', 'DEVELOPMENT_TEAM = A1B2C3D4E5;'],
    ['ios/project.yml', "DEVELOPMENT_TEAM: 'A1B2C3D4E5'"],
    ['ios/Config/Signing.xcconfig', 'DEVELOPMENT_TEAM = A1B2C3D4E5'],
    ['ios/ExportOptions.plist', '<key>teamID</key><string>A1B2C3D4E5</string>'],
    ['ios/App.entitlements', '<key>TeamIdentifier</key><array><string>A1B2C3D4E5</string></array>'],
    ['ios/App.xcodeproj/project.pbxproj', 'CODE_SIGN_IDENTITY = "Apple Development: Example Person (A1B2C3D4E5)";'],
    ['ios/project.yml', 'CODE_SIGN_IDENTITY: "Developer ID Application: Example Person (A1B2C3D4E5)"'],
    ['ios/App.xcodeproj/project.pbxproj', 'CODE_SIGN_IDENTITY = "0123456789ABCDEF0123456789ABCDEF01234567";'],
    ['ios/App.xcodeproj/project.pbxproj', 'PROVISIONING_PROFILE_SPECIFIER = "Personal Distribution";'],
    ['ios/ExportOptions.plist', '<key>provisioningProfiles</key><dict><key>org.example.app</key><string>Personal Profile</string></dict>'],
    ['ios/ExportOptions.plist', '<key>AppleID</key><string>example@example.com</string>'],
    ['ios/App.xcodeproj/project.pbxproj', 'ORGANIZATIONNAME = "Example Person";'],
    ['ios/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme', 'customWorkingDirectory = "/Users/example/private"'],
  ];
  for (const [path, content] of fixtures) {
    const result = check({ [path]: content });
    assert.equal(result.status, 1, `${path}: ${content}`);
    assert.ok(result.stderr.includes(path));
    assert.ok(!result.stderr.includes('A1B2C3D4E5'), 'diagnostics must omit identity values');
  }
});

test('ignored release artifacts and credentials are rejected if force-added', () => {
  for (const path of ['Signing.local.xcconfig', 'Account.developerprofile', 'App.provisionprofile', 'App.mobileprovision', 'web/.deploy.site.local.json', 'User.xcuserstate', 'web/public/downloads/App.dmg', 'App.zip', 'App.app/Contents/Info.plist']) {
    const result = check({ '.gitignore': '*\n', [path]: 'test-only placeholder' }, true);
    assert.equal(result.status, 1, path);
  }
});

test('actual publisher fields and recognizable tokens cannot enter the public tree', () => {
  for (const key of Object.keys(blankPublisher)) {
    const result = check({ 'web/site.config.json': JSON.stringify({ ...blankPublisher, [key]: 'example publisher' }) });
    assert.equal(result.status, 1, key);
  }
  const token = ['ghp', '_', 'A'.repeat(36)].join('');
  const result = check({ 'credentials.txt': token });
  assert.equal(result.status, 1);
  assert.ok(!result.stderr.includes(token));
});
