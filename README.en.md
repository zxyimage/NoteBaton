# NoteBaton

[简体中文](README.md) · English

**Capture on iPhone. Continue on Mac or in a browser.** NoteBaton is a local-first notes app for text, links, and Markdown. It supports offline editing and end-to-end encrypted sync across iPhone, Mac, and the web. No account is required, and you can host your own sync service.

[Download and use](https://notebaton.org/download) · [Open the web app](https://notebaton.org/note) · [Self-host](docs/自部署.md) · [Build for iPhone](ios/README.md) · [Install on Mac](macos/README.md)

## Features

- **Capture ideas:** Create, edit, copy, and delete text, link, or Markdown notes. Changes save automatically; Markdown previews and clipboard import make it easy to pick up an idea.
- **Continue across devices:** iPhone-to-iPhone and iPhone-to-Mac sync works in both directions. Each native device keeps its own local copy. Offline edits and deletions catch up when paired devices are online together, and concurrent edits retain the conflicting content.
- **Edit in a browser:** Authorize a browser with a QR code or complete pairing link. The paired iPhone must stay in the foreground, or the Mac app must remain running, for the browser to read or save new changes.
- **Keep content on your devices:** Sync content uses AES-256-GCM end-to-end encryption. The relay has no note-decryption key and does not persist note bodies. Pairing links contain keys and must be kept private.
- **Choose your service:** Use [notebaton.org](https://notebaton.org) or deploy the website and relay API to your own Cloudflare account. The app can save and switch between service addresses while keeping the same local library, without recompilation.
- **Use English or Simplified Chinese:** The iPhone, Mac, and web interfaces offer both languages. Changing the interface language does not change note content.

This repository contains source code, the self-hosted service, and development tests. Released apps are maintained separately; installers, signing materials, and App Store submission records are excluded.

## Get started

| Platform | How to get it | Requirements |
| --- | --- | --- |
| iPhone | [Official downloads](https://notebaton.org/download); developers can [build with Xcode](ios/README.md) | iOS 17+; iPhone only |
| Mac | [Download the signed and notarized DMG](https://notebaton.org/downloads/NoteBaton-macOS-1.0.0.dmg) | macOS 14+; Apple silicon and Intel |
| Web | Open [NoteBaton / Note](https://notebaton.org/note) or your own deployment | Pair with an online iPhone or Mac |

1. Open NoteBaton on iPhone or Mac. New notes save locally without a network connection or account.
2. To continue in a browser, open the website's **Note** page and generate a pairing QR code or link. In the app, open **Pairing & Sync**, scan or paste the link, check the full service address, and authorize it.
3. To connect another iPhone or Mac, point both devices at the same service. Generate a device pairing code on the new device, then scan or paste and approve it on an existing device. Their libraries merge.

Browser authorization lasts up to seven days, device authorization up to one year, and pairing codes five minutes. iPhone sync runs while the app is in the foreground; the Mac app can stay connected while running. Native devices can edit offline. A browser cannot load or save new content while its paired device is offline. See the [multi-device sync guide](docs/多设备同步.md) for connection and conflict behavior.

## Host your own service

You need Node.js 22.12 or later, npm, and a Cloudflare account. Clone the complete repository and run the commands below. No operator name, app developer information, or privacy contact email is required:

```sh
cd web
npm ci
npx wrangler login
npm run deploy -- --name my-notebaton
```

Open the URL printed by Wrangler to go directly to notes and pairing. A self-hosted deployment includes note display, editing, pairing, sync, and the relay API. It excludes the product homepage, app downloads, privacy policies, and terms, and does not read `web/site.config.json`. Keep the same Worker name and URL for future updates; changing the domain requires pairing again. See the [self-hosting guide](docs/自部署.md) for the full setup.

## Data and security boundaries

Note bodies persist on synced iPhones and Macs. The browser keeps loaded notes and unsent drafts in the current page's memory. The relay forwards ciphertext and stores the metadata needed for pairing, authorization, and routing. Public connections also use HTTPS/WSS.

Use only websites you trust and keep pairing links private. Malicious website code or a compromised device can still read plaintext at an endpoint. The current protocol has no forward secrecy and has not had an independent cryptographic audit. Sync is not a backup: there is no cloud backup or account recovery, and losing every local copy loses your notes. Read the [encryption design](docs/端到端加密.md), [security guidance](SECURITY.md), and [privacy policy](https://notebaton.org/app-privacy/).

## Development

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run dev:api
# In another terminal, from web/:
TEST_BASE_URL=http://127.0.0.1:8787 npm test
```

The default `npm run build` / `npm run deploy` commands build and deploy the self-hosted notes service. The official site uses separate `npm run build:site` / `npm run deploy:site` commands, output directories, and deployment configuration. See [official site publishing](docs/隐私政策与发布.md).

Run `npm run dev` for the web frontend. The iOS and macOS apps share `ios/Clipboard.xcodeproj`; select the `NoteBaton` and `NoteBatonMac` schemes, respectively. See [contributing](CONTRIBUTING.md) for tests and contribution guidelines.

- `ios/`: iPhone app, shared Swift sync core, SQLite, Keychain, and the dual-platform Xcode project.
- `macos/`: Mac interface, resources, and installation guide.
- `web/`: React website, Cloudflare Worker, relay API, and protocol tests.
- `shared/messages.json`: English and Simplified Chinese UI copy shared by the app and web client.
- `docs/`: Deployment, sync protocol, encryption design, and open-source checks.

[API protocol](web/API.md) · [Product requirements (Chinese)](需求文档.md) · [Implementation plan (Chinese)](实施计划.md)

## License

This project uses the [MIT License](LICENSE). Third-party components retain their own licenses; see the [third-party notices](THIRD_PARTY_NOTICES.txt).
