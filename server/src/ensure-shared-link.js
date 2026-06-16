// ensure-shared-link.js — make the server independent of the npm-workspace symlink.
//
// npm workspaces link @hrms/shared into node_modules as a symlink/junction. That
// link is created for the OS that ran `npm install`. When node_modules is copied
// from one OS to another (e.g. a Linux CI/build to a Windows server), the link is
// dangling and `import ... from "@hrms/shared/..."` fails at boot with
// ERR_MODULE_NOT_FOUND — taking the whole server (and therefore the whole app) down.
//
// This runs at the very start of boot, BEFORE any module that imports @hrms/shared
// is loaded, and recreates the link from the real ./shared package if it's missing
// or broken. Idempotent and a no-op when the link is already healthy (Docker, Linux
// dev, Windows after a native npm install). No admin rights needed (junction on win32).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // hrms/server/src
const root      = path.resolve(__dirname, "../..");            // hrms
const sharedPkg = path.resolve(root, "shared");                // hrms/shared (real package)
const linkDir   = path.resolve(root, "node_modules", "@hrms");
const link      = path.join(linkDir, "shared");               // hrms/node_modules/@hrms/shared

export function ensureSharedLink() {
  // Already healthy? (existsSync follows the link; false for a dangling link.)
  try {
    if (fs.existsSync(path.join(link, "package.json"))) {
      JSON.parse(fs.readFileSync(path.join(link, "package.json"), "utf8"));
      return; // resolves to a real package — nothing to do
    }
  } catch { /* fall through and repair */ }

  if (!fs.existsSync(path.join(sharedPkg, "package.json"))) {
    console.error(`⚠  @hrms/shared link is broken and the source package was not found at ${sharedPkg}.`);
    return; // let the import below surface a clear error
  }

  try {
    fs.mkdirSync(linkDir, { recursive: true });
    try { fs.rmSync(link, { recursive: true, force: true }); } catch { /* dangling/none */ }
    fs.symlinkSync(sharedPkg, link, process.platform === "win32" ? "junction" : "dir");
    console.log("🔧 Repaired node_modules/@hrms/shared (workspace link was missing/broken).");
  } catch (e) {
    console.error(`⚠  Could not repair @hrms/shared link automatically: ${e.message}`);
    console.error("   Fix manually:  node link-shared.mjs   (from the hrms root), then restart.");
  }
}
