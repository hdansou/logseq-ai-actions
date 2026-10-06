---
"logseq-ai-actions": patch
---

Security hardening for endpoint changes, credentials, and image reads

- You are now warned when your endpoint moves to a different REMOTE host, not
  only on the first switch away from localhost. A half-edited (unparseable)
  Base URL no longer resets this check or shows the warning.
- A warning appears when an API key would be sent over plain `http://` to a
  non-loopback host (use `https://` if the server supports it).
- Credentials typed into the Base URL (`http://user:pass@host`) are no longer
  shown in the endpoint badge, error messages, or the debug log.
- Image actions only read files at `assets/<uuid>.<ext>`; malformed asset
  metadata can no longer point the file read elsewhere.
