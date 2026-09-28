# Web Privacy Policy

Effective date: {{EFFECTIVE_DATE}}

Relay Clipboard (接力) connects a browser to notes stored on your iPhone or Mac. This policy explains how the official NoteBaton website handles information. Contact: {{WEB_CONTACT}}.

## 1. Scope and your choice of service

This policy applies to this website and its relay API as supplied with Relay Clipboard 3.2. The iOS and macOS clients have a separate [App Privacy Policy](/app-privacy/). Independently hosted copies are operated by their own operators, who must identify themselves and describe any changes to these practices. The open-source maintainers do not automatically receive data from independent deployments.

You do not need to create a named account, provide an email address, or submit payment details to pair a browser. You choose which website to authorize from your phone. A paired website can read, create, edit, and delete your phone's notes. Showing the latest 10 notes first is pagination, not a limit on that access.

## 2. Information used and why

- **Note content:** text, links, Markdown, note identifiers, timestamps, revisions, and editing instructions are encrypted on the sending endpoint and decrypted on the receiving endpoint. The relay forwards encrypted messages to provide synchronization; it does not persist note content or message ciphertext in its application database.
- **Pairing and authentication:** the service stores randomly generated device and browser identifiers, hashes of authentication secrets, pairing approvals, and expiry times to authenticate connections and enforce access. These identifiers are not your phone's hardware serial number or advertising identifier. Authentication secrets are distinct from note-encryption keys.
- **Connection and security information:** the hosting provider processes IP addresses and ordinary request information. The relay uses a hash of the source IP for short-lived rate limiting. Routing identifiers, connection times, message sizes, sequence numbers, and online status remain visible to the relay. Operational or security logs may include request metadata and errors, but the application does not intentionally log note content or encryption keys.
- **Messages you send us:** if you contact the operator, the operator receives your email address and anything you choose to include, solely to respond, investigate the issue, or meet a legal obligation. Do not send notes, active pairing links, or secrets unless necessary and specifically arranged.

The supplied website has no advertising, marketing cookies, third-party analytics, or tracking SDKs. It does not sell personal information or share it for cross-context behavioral advertising.

## 3. Encryption and browser storage

Synchronization uses AES-256-GCM end-to-end encryption, in addition to HTTPS/WSS on public deployments. A random pairing key is passed directly from your browser to your phone through a QR code or complete pairing string. A key in a URL fragment is not sent in the HTTP request. Treat the complete link as a secret.

The browser stores an essential `relay_session` cookie, normally valid for up to seven days, and a non-exportable encryption key with its expiry in this website's IndexedDB storage. These enable pairing and reconnection; they are not advertising identifiers. The application keeps displayed notes and unsent drafts in page memory, not in a persistent browser note database. Closing or reloading the page can lose unsent changes. Browser, operating-system, extension, or copied-content behavior is outside this application's storage controls.

Your language preference is saved in local storage so the website can remember your choice.

The relay API does not receive note-decryption keys. However, you must trust the website's code and your endpoints: a compromised or modified website, browser extension, or device can read decrypted content or use a stored key. The current protocol does not provide forward secrecy and has not undergone an independent cryptographic audit.

## 4. Providers and disclosures

The supplied backend runs on Cloudflare Workers and Durable Objects. Cloudflare processes network traffic and service metadata to deliver, secure, and operate the service; processing may occur in countries other than yours. See [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/). Operators are responsible for choosing appropriate provider settings and contractual safeguards, and for identifying any additional providers they introduce.

Information may also be disclosed when required by law or necessary to address abuse, fraud, or a security incident. Only information actually available to the operator can be disclosed; these circumstances do not create a capability to decrypt notes. Links you open from a note or from this website lead to services governed by their own policies.

## 5. Retention and deletion

Pairing requests expire after five minutes and are scheduled for cleanup. Browser authorizations expire after at most seven days or can be revoked earlier. Rate-limit records are scheduled for cleanup after about two minutes. Infrastructure scheduling can delay physical cleanup. Device identity records have no automatic expiry in the supplied backend and may remain until the operator removes them. Hosting logs and provider backups follow the operator's configuration and the provider's retention terms; the short pairing expiry is not a promise that all infrastructure records are erased at that time.

Support correspondence is kept only as long as reasonably needed to handle the request, address related issues, or meet legal obligations. You can request deletion using the contact above.

Use **Exit pairing** on the website or remove the browser in the App's **Pairing & Services** screen to end access. Clear this website's cookies and site storage to remove local credentials; removing the browser authorization in the App also revokes server access. Clearing browser data does not delete notes from the phone. To delete a note, delete it in the App or through an authorized, connected browser. Revocation cannot recall content someone has already copied, downloaded, or captured.

## 6. Your choices and requests

Pairing is optional. You can keep notes on your phone without connecting a relay, stop synchronization by disconnecting the service, revoke browser access, and clear browser storage. Depending on where you live, you may have rights to access, correct, delete, restrict, object to processing, or obtain a copy of personal information, and to complain to your local data-protection authority. Contact {{WEB_CONTACT}} to make a request about this deployment. The operator may need enough information to verify which records belong to you; do not send your encryption key. The operator cannot recover or decrypt device-only notes.

This service is not directed to children under 13, or a higher minimum age where local law requires it. Contact the operator if you believe a child has provided personal information.

## 7. Changes

Updates will be published here with a revised effective date. Material changes to data handling will be explained before they take effect where required, and additional consent will be requested where required. This notice describes data handling; it does not turn optional processing into a condition of using unrelated features.

## Native device sync extension

This service also relays encrypted sync messages between iOS and macOS devices and retains pairing-type and expiry metadata. Native device authorizations last up to 365 days and may be revoked earlier; browser access remains limited to seven days. Paired native libraries merge and each device retains a local copy. The relay does not store those copies or sync ciphertext. Deletions propagate; revocation does not erase previously synced copies. See the [App Privacy Policy](/app-privacy/).
