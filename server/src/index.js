// Entry point. Kept at this path so Dockerfile / pm2 / nssm / the deployment
// guide can all keep launching `server/src/index.js` unchanged.
//
// We repair the @hrms/shared workspace link (if a cross-OS node_modules copy
// left it dangling) BEFORE loading the app. The app and its routes import
// @hrms/shared, so they must be pulled in via dynamic import AFTER the repair —
// a static import here would be resolved before ensureSharedLink() could run.
import { ensureSharedLink } from "./ensure-shared-link.js";

ensureSharedLink();

await import("./server.js");
