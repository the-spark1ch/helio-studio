const path = require("path");
const fs = require("fs-extra");

async function main() {
  const src = path.join(__dirname, "..", "node_modules", "monaco-editor", "min", "vs");
  const dst = path.join(__dirname, "..", "src", "renderer", "monaco", "vs");

  await fs.remove(dst);
  await fs.ensureDir(dst);
  await fs.copy(src, dst);

  console.log("✅ Monaco copied to:", dst);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
