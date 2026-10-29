# AG Studio local setup

Status: operator production charts/grid and a server-backed grounded assistant are implemented and locally browser-tested. This setup has not been deployed. See MANUFACTURING_BUILD_REPORT.md.

- Exact dependencies: ag-studio-react 3.0.0 and ag-studio 3.0.0.
- Paste the complete validated licence into VITE_AG_STUDIO_LICENSE_KEY in ignored .env.local. Never replace existing .env provider credentials or paste those credentials into a VITE_ variable.
- src/scrapdrop/AgStudioScope.tsx uses AgStudioProvider with that value and AgStudioAiModule, matching the supplied React instructions. It wraps the lazy-loaded production insights panel and falls back for unavailable/invalid/expired configuration. Missing configuration renders the supplied fallback.
- Registration of the AI module does not configure a model, send Gemini requests or create a paid service subscription. The implemented analytics runner uses the server-backed endpoint and existing budget controls; fixture mode makes no provider requests.
- Restart local development after changing .env.local. Vite reads this file for frontend builds; the licence is embedded in browser code when the scope is used. Git/chat exclusion is not secrecy from a browser visitor. Gemini and PayPal secrets remain server-only.
- Render does not read your local file: a permitted hosted evaluation would need the equivalent build-time environment variable and a rebuild.
- The supplied trial wording says evaluation only, production use not permitted, and expiry 10 December 2026. Use within those terms; obtain appropriate coverage before relying on it for a hosted production deployment or the full judging period. Do not remove licence checks or publish a working key in repository source.

Official React setup: https://www.ag-grid.com/studio/react/licence-install/
