// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */

const {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
} = require("fs");
const { resolve, dirname, join } = require("path");
const esbuild = require("esbuild");
const { spawnSync } = require("child_process");
const assert = require("assert");

(async () => {
  // Read tslib source
  const tslibPath = resolve(dirname(require.resolve("tslib")), "tslib.es6.mjs");

  // Create virtual entry points for each export
  const tslib = require("tslib");
  const entryPoints = Object.keys(tslib);

  // Ensure output directory exists
  const workDir = join(__dirname, ".work");
  const outDir = join(workDir, "out");
  const srcDir = join(workDir, "src");
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  mkdirSync(srcDir, { recursive: true });

  // Create and write entry point files
  const entryFiles = entryPoints.map((key) => {
    const entryPath = join(srcDir, `${key}.js`);
    writeFileSync(entryPath, `export { ${key} } from "${tslibPath}"`);
    return entryPath;
  });

  // Build with esbuild
  await esbuild.build({
    entryPoints: entryFiles,
    bundle: true,
    format: "esm",
    outdir: outDir,
    splitting: true,
    platform: "neutral",
    treeShaking: true,
    minifyWhitespace: true,
  });
  spawnSync(resolve(__dirname, "../node_modules/.bin/prettier"), [
    "-w",
    outDir,
    "--print-width=Infinity",
  ]);
  const chunks = {};
  for (const file of readdirSync(outDir)) {
    const content = readFileSync(join(outDir, file), "utf8");
    let name;
    let deps = [];
    const code = content
      .replace(/^(import|export)\s*(.+)/gm, (_, type, rest) => {
        if (type === "export") {
          assert(/^\s*\{\s*\w+\s*\}[\s;]*/.test(rest));
          assert(!name);
          name = rest.split("}")[0].split("{")[1].trim();
          return "";
        } else if (type === "import") {
          if (rest[0] === '"') return "";
          assert(/^\s*\{\s*\w+(?:\s*,\s*\w+)*\s*\}[\s;]*/.test(rest));
          deps.push(...rest.split("}")[0].replace(/[{\s]/g, "").split(","));
          return "";
        }
        assert(false);
      })
      .trim();
    if (deps.length === 1 && name === deps[0] && code === "") continue;
    assert.equal(chunks[name], undefined);
    chunks[name] = { deps, code };
  }
  rmSync(workDir, { recursive: true });
  writeFileSync(
    join(__dirname, "../src/helpers.ts"),
    `export const helpers: Record<\n  string,\n  {\n    deps: string[];\n    code: string;\n  }\n> = ` +
      JSON.stringify(chunks)
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
