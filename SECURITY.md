# Security

## Data and privacy

- **Local-first:** Vantura stores all data in your browser (IndexedDB). Transaction and account data does not leave your device except to sync with the Up Bank API using a token you provide.
- **API token:** Your Up Bank Personal Access Token is encrypted with a key derived from your passphrase (PBKDF2-SHA256, 100,000 iterations; AES-GCM 256-bit). The passphrase is never stored. Only the encrypted token and derivation salt are stored locally.
- **No secrets in repo:** No API keys, tokens, or passphrases are committed to this repository. `.env` and `.env.*` are gitignored.
- **Profile export/import:** Exported files contain only non-sensitive configuration whitelisted in code (e.g. theme, accent, payday and pay amount, spendable alert thresholds, dashboard section order, categorization rules, insights category colours, dashboard tour completed flag), plus trackers and upcoming charges. Files are encrypted with a user-chosen passphrase (PBKDF2 + AES-GCM, same primitives as API token storage). Transactions, account data, API tokens, and encryption keys are never exported.

## Reporting a vulnerability

If you believe you have found a security vulnerability, please report it responsibly:

- **Preferred:** [Open a private security advisory](https://github.com/ostafford/Vantura_v3/security/advisories/new) on GitHub.
- Alternatively, open a private issue or contact the maintainer directly if you have a secure channel.

Do not open a public issue for security-sensitive findings.
