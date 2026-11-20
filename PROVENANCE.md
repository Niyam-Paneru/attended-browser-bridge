# Source and licensing

The policy/effect control core is based on the public MIT-licensed [Attended Browser Bridge at b5b78af](https://github.com/Niyam-Paneru/attended-browser-bridge/tree/b5b78af1e4dcdd9aff0db60ee19f2743c9f72a0d). The review extension adds the filesystem-backed ledger and a loopback-only Playwright adapter, using the original `BrowserBridge.prepare()` path for the write decision rather than duplicating the core. It also adds an explicit rejected state. `LICENSE` is retained unchanged.

The full private implementation is separate and not distributed here. No private source was copied into this extension. The synthetic example is not evidence that the private browser transport itself ran during this public demo.

Playwright is an external Apache-2.0 dependency installed separately by npm; browser binaries are installed separately by Playwright. See `package-lock.json` for exact package versions/integrity. No dependency or browser binaries are bundled in the archive. The included source and synthetic fixture carry the repository's MIT licence.
