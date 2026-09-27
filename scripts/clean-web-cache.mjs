#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  path.resolve(root, "apps/web/.next"),
  path.resolve(root, "apps/web/.next-dev"),
  path.resolve(root, "apps/web/tsconfig.tsbuildinfo")
];

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`removed ${path.relative(root, target)}`);
}
