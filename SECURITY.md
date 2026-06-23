# Security

## Data and privacy

- **Local-first:** Vantura stores all data in your browser (IndexedDB). Transaction and account data does not leave your device except to sync with the Up Bank API using a token you provide.
- **API token:** Your Up Bank Personal Access Token is encrypted with a key derived from your passphrase (PBKDF2-SHA256, 100,000 iterations; AES-GCM 256-bit). The passphrase is never stored. Only the encrypted token and derivation salt are stored locally.
- **No secrets in repo:** No API keys, tokens, or passphrases are committed to this repository. `.env` and `.env.*` are gitignored.
- **Biometric unlock (optional):** Touch ID / Face ID via WebAuthn caches a credential ID in `app_settings`. The underlying passphrase-derived key is stored in the browser credential store and never written to IndexedDB. Biometric unlock is a convenience layer — it does not replace the passphrase, which is still required for re-onboarding or clearing data.
- **Profile export/import:** Exported files contain only non-sensitive configuration whitelisted in code (e.g. theme, accent, payday and pay amount, spendable alert thresholds, dashboard section order, insights category colours, dashboard tour completed flag), plus trackers and upcoming charges. Files are encrypted with a user-chosen passphrase (PBKDF2 + AES-GCM, same primitives as API token storage). Transactions, account data, API tokens, and encryption keys are never exported.

## Hosting

Vantura is served as a static bundle from Cloudflare Pages (`https://myvantura.xyz`). Cloudflare Pages acts purely as a file server — it delivers HTML, JavaScript, and CSS to your browser and has no access to anything stored inside it. The domain, CDN, and hosting all reside within Cloudflare, eliminating any intermediate provider hops.

The following data never leaves your device and is invisible to the hosting provider:

- IndexedDB contents (transactions, trackers, upcoming charges, settings)
- Your Up Bank API token (encrypted in IndexedDB; never transmitted to any server other than `api.up.com.au`)
- Your passphrase (never stored anywhere)
- Biometric credentials (stored in the browser credential store, not IndexedDB)

All Up Bank API requests are made directly from your browser to `https://api.up.com.au` — they do not pass through Cloudflare or any intermediate server.

Previous hosting providers (GitHub Pages, then Netlify) offered the same privacy guarantee. The consolidation to Cloudflare Pages was made to unify domain management, CDN, and hosting under a single provider. The data model and URL (`myvantura.xyz`) are unchanged.

## Reporting a vulnerability

If you believe you have found a security vulnerability, please report it responsibly:

- **Preferred:** [Open a private security advisory](https://github.com/ostafford/Vantura_v3/security/advisories/new) on GitHub.
- Alternatively, open a private issue or contact the maintainer directly if you have a secure channel.

Do not open a public issue for security-sensitive findings.
