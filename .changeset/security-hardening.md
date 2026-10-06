---
"logseq-ai-actions": patch
---

Security hardening for remote endpoints, credentials, and image reads

- Before the first request to a REMOTE (non-loopback) host, and again whenever
  that host changes, the action asks you to confirm; **Cancel** sends nothing.
  The prompt also warns when an API key would be sent over plain `http://`.
  If you already use a remote endpoint, you'll be asked once on your next
  action. (This replaces the old warning on settings change, which could be
  hidden behind the settings window.)
- Credentials typed into the Base URL (`http://user:pass@host`) are no longer
  shown in the endpoint badge, error messages, or the debug log.
- Image actions only read files at `assets/<uuid>.<ext>`; malformed asset
  metadata can no longer point the file read elsewhere.
