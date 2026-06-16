// link-shared.mjs — repair the @hrms/shared workspace link on Windows.
//
// Your node_modules links were created during a Linux install, and Windows
// Node can't follow Linux symlinks — so `import ... from "@hrms/shared/..."`
// fails with ERR_MODULE_NOT_FOUND. This recreates node_modules/@hrms/shared as
// a native Windows *junction* pointing at the real shared package, which Node
// then resolves via its exports map. Run once from the hrms root:
//
//   cd D:\Claude\Projects\HRone\hrms
//   node link-shared.mjs
//
// (No admin rights needed. Safe to re-run.)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const target  = path.resolve(__dirname, "shared");                 // hrms/shared (the package)
const linkDir = path.resolve(__dirname, "node_modules", "@hrms");
const link    = path.join(linkDir, "shared");                      // node_modules/@hrms/shared

if (!fs.existsSync(path.join(target, "package.json"))) {
  console.error("\n  Cannot find shared/package.json at", target);
  console.error("   Run this from the hrms root folder.\n");
  process.exit(1);
}

fs.mkdirSync(linkDir, { recursive: true });
try { fs.rmSync(link, { recursive: true, force: true }); } catch { /* nothing to remove */ }

fs.symlinkSync(target, link, "junction"); // 'junction' = Windows-native directory link

// Sanity check: resolve the package.json through the new link.
const pkg = JSON.parse(fs.readFileSync(path.join(link, "package.json"), "utf8"));
console.log("\n  Linked  node_modules/@hrms/shared  ->  ..\\shared");
console.log(`   Resolves: ${pkg.name}@${pkg.version}`);
console.log("   Restart the dev server (npm run dev) and the [server] error is gone.\n");
