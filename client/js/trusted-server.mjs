// ES-module entry for the shared server allowlist (implementation lives in ./trusted-server.js so classic
// inline scripts can load the same code with <script src>). See HANDOFF.md "Security hardening".
import './trusted-server.js';
const T = globalThis.BCTrustedServer;
export const DEFAULT_SERVER = T.DEFAULT_SERVER;
export const trustedServer = T.trustedServer;
export const isLocalPage = T.isLocalPage;
export const safeXamanUrl = T.safeXamanUrl;
