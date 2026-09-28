# App Privacy Policy

Effective date: {{EFFECTIVE_DATE}}

This policy describes the Relay Clipboard (接力) iOS and macOS apps, version 3.2 and later versions that follow these practices. The App developer is **{{APP_DEVELOPER}}**. Privacy contact: {{APP_CONTACT}}.

## 1. Local notes and optional synchronization

The App lets you write, paste, copy, and preview text, links, and Markdown. Notes are stored in a SQLite database on your iPhone or Mac. You can use local notes without creating an account or connecting a server. The App displays notebaton.org as the official website and also supports independent deployments. It connects to a relay only after you confirm the service address. Tapping the website link opens your browser; displaying or copying the address does not connect a relay.

When you authorize a website, it can read, create, edit, and delete the App's notes while the App is connected and in the foreground. The initial batch of 10 recently modified notes is a display limit, not an access restriction. Switching relay services keeps the same local note library, so a newly authorized website can access existing notes too.

## 2. Information processed on your device

- **Notes and drafts:** note text, links, formatting, identifiers, creation and modification times, revisions, and content hashes used for duplicate detection are processed locally. Editing a note saves it automatically, including when you return without tapping Save.
- **Clipboard:** after you start using the App, it checks for text when it becomes active, subject to iOS permission. New, non-duplicate text within the size limit can become a saved note and synchronize to authorized devices and browsers. Pairing links are handled as pairing input instead of ordinary notes. The App does not continuously monitor other apps in the background. Copy and Paste controls use the system clipboard; copied content can be available to other apps or Apple's Universal Clipboard under your system settings.
- **Camera:** only when you open the QR scanner and grant camera permission, camera frames are processed on-device to recognize a pairing code. The App does not save or upload camera photos or video. You can enter a complete pairing link manually instead and can revoke camera access in iOS Settings.
- **Service settings and keys:** selected service addresses, activation, migration, and language preferences, and the last clipboard-content hash are stored locally. Separate random device identities and authentication credentials are created for each service. Pairing encryption keys are stored in the system Keychain with device-only, unlocked-device access protection. These are not advertising identifiers or hardware serial numbers.

The App does not request your contacts, location, microphone, photo library, or health data. It contains no advertising, third-party analytics, tracking SDK, or developer-operated crash-upload SDK. The developer does not sell personal information or share it for cross-app advertising. Apple may process App Store, device, or diagnostic information under your Apple settings and Apple's own policies.

## 3. What leaves the phone

When you connect a service, the App sends the authentication and routing information needed to establish and maintain that connection. The operator's hosting provider sees your IP address and ordinary connection metadata. The supplied relay stores random device/browser identifiers, hashes of authentication secrets, pairing approvals, and expiry information; it uses a hashed source IP for short-lived rate limiting. Request or error logs may retain technical metadata under that deployment's settings.

Notes, note identifiers, timestamps, revisions, and editing messages are end-to-end encrypted between the App and each paired browser with AES-256-GCM. Public transport also uses HTTPS/WSS. Pairing keys are transferred directly through the QR code or complete pairing string and are not sent to the relay API. The supplied relay forwards ciphertext without storing note messages in its application database. A paired browser receives decrypted notes in page memory and stores its own pairing credential and encryption key locally.

End-to-end encryption does not hide online status, routing identities, message sizes, or timing. It also cannot protect against a compromised phone, browser, browser extension, or malicious website code. Use only websites you trust. The current protocol does not provide forward secrecy and has not undergone an independent cryptographic audit.

If you choose the separate legacy-import feature for version 1 cloud notes, that historical import is protected by HTTPS, not by the newer end-to-end protocol. The App requests deletion of the old cloud notes after confirming their local import. Subsequent synchronization uses end-to-end encryption.

## 4. Operators, providers, and contact messages

The App developer and the operator of your chosen relay may be different people. Connecting to an independent deployment does not automatically send your information to the App developer. Review that website's privacy policy and contact its operator about its logs or server records. Operators are responsible for protecting information they process and for providing appropriate safeguards with their providers.

The supplied backend uses Cloudflare Workers and Durable Objects. Cloudflare processes traffic and operational metadata to provide and secure that service, potentially in other countries. See [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/). The App does not send note content to an AI provider or use it to train models. Opening a link in a note launches the appropriate external app or browser, whose data practices are separate.

If you email the developer, the developer uses your address and message to respond, resolve the issue, and meet any applicable legal obligations. Do not include private notes or active pairing credentials. Information actually held may be disclosed when legally required or needed to address abuse or a security incident; the developer cannot provide a decryption capability it does not have.

## 5. Retention, deletion, and control

Notes remain on your device until deleted or the App's data is removed. The App excludes its note database from system backups and provides no cloud backup or account recovery. Uninstalling the App or losing the phone can permanently lose notes. Local files rely on iOS device protection; they do not have an additional App-managed database encryption layer. Deleting a note removes it from the active library, but it is not a promise of forensic erasure from storage or copies you made elsewhere.

Pairing requests expire after five minutes; browser authorizations expire after at most seven days. The supplied relay schedules expired authorizations and short-lived rate-limit records for cleanup. Device registration records have no automatic expiry, and infrastructure logs or backups may have separate retention periods. Contact your relay operator for removal of server-side records.

The developer keeps support correspondence only as long as reasonably needed to handle the request, address related issues, or meet legal obligations. You can request deletion using the privacy contact above.

You can delete notes in the App, remove an authorized browser in **Pairing & Services**, disconnect the service to use local-only mode, and change camera or paste permissions in iOS Settings where those controls are available. Revoking a browser deletes its local pairing key and asks the relay to end its access. Revocation cannot recall content already copied or captured. Disconnecting a service does not itself delete its saved identity or server records. Keychain items can survive App removal; do not rely on uninstalling alone to revoke a browser or erase service credentials.

If you have privacy rights under applicable law, including access, correction, deletion, restriction, objection, portability, or withdrawal of consent, contact {{APP_CONTACT}} about information held by the developer, or your relay operator about its records. Requests may require proportionate verification; never send encryption keys. You may also complain to your local data-protection authority. The developer cannot read, restore, or delete phone-only notes remotely.

## 6. Children and policy changes

The App is not directed to children under 13 or a higher minimum age required by local law. Contact the developer if you believe a child has provided personal information.

Changes to these practices will be reflected in an updated policy and effective date, with notice and additional consent where required. You can read this policy in the App before starting and later from **Pairing & Services**, as well as at the public App Privacy Policy URL provided with the App Store listing.

## Device-to-device sync

Pairing native devices merges both local libraries and retains a copy on each device. Native authorizations last up to one year, browser authorizations up to seven days, and pairing codes expire after five minutes. The relay retains pairing type and expiry metadata, but does not persist note bodies or encrypted sync traffic. The app stores version vectors, acknowledged sync cursors, and deletion markers without note text locally to support offline edits, reconnection, and protection against stale notes reappearing. Concurrent edits may be retained as separate conflict copies.

Changes exchange when both paired endpoints are online, with iPhone in the foreground or the Mac app running. Deletions propagate; revoking access does not erase copies already synced to other devices. Sync is not an independent backup. Mac files rely on system account permissions and disk protection without additional database encryption. The Mac app supports pasted pairing links and does not use the camera.
