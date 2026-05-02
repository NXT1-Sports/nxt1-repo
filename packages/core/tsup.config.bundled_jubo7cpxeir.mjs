// tsup.config.ts
import { defineConfig } from "tsup";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function fixEsmImports(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await fixEsmImports(fullPath);
    } else if (entry.name.endsWith(".js")) {
      const content = await readFile(fullPath, "utf-8");
      const fixed = content.replace(
        /((?:from|import)\s*['"])(\.\.?\/[^'"]+?)(['"])/g,
        (_match, prefix, path, suffix) => {
          if (/\.(js|cjs|mjs|json|css|wasm|node)$/.test(path)) {
            return `${prefix}${path}${suffix}`;
          }
          return `${prefix}${path}.js${suffix}`;
        }
      );
      if (fixed !== content) {
        await writeFile(fullPath, fixed, "utf-8");
      }
    }
  }
}
var tsup_config_default = defineConfig({
  entry: [
    "src/index.ts",
    "src/*/index.ts",
    "src/errors/express.middleware.ts",
    "src/testing/auth-fixtures.ts",
    "src/testing/auth-mocks.ts",
    "src/testing/test-data.ts"
  ],
  format: ["cjs", "esm"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  dts: false,
  // Enable splitting to deduplicate shared code across entry points
  // This prevents dual-package issues where classes like NxtApiError
  // get bundled multiple times causing instanceof checks to fail
  splitting: true,
  sourcemap: true,
  clean: !process.argv.includes("--watch"),
  outDir: "dist",
  // Exclude Angular/Ionic dependent files - these have moved to @nxt1/ui
  external: ["@angular/*", "@ionic/*", "ionicons"],
  async onSuccess() {
    await fixEsmImports("dist");
    console.log("\u2705 Fixed ESM relative import extensions");
  }
});
export {
  tsup_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHN1cC5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9faW5qZWN0ZWRfZmlsZW5hbWVfXyA9IFwiL1VzZXJzL2pvaG5rZWxsZXIvTXkgTWFjIChKb2hucy1NYWNCb29rLVByby5sb2NhbCkvTWFpbi9OWFQxL254dDEtbW9ub3JlcG8vcGFja2FnZXMvY29yZS90c3VwLmNvbmZpZy50c1wiO2NvbnN0IF9faW5qZWN0ZWRfZGlybmFtZV9fID0gXCIvVXNlcnMvam9obmtlbGxlci9NeSBNYWMgKEpvaG5zLU1hY0Jvb2stUHJvLmxvY2FsKS9NYWluL05YVDEvbnh0MS1tb25vcmVwby9wYWNrYWdlcy9jb3JlXCI7Y29uc3QgX19pbmplY3RlZF9pbXBvcnRfbWV0YV91cmxfXyA9IFwiZmlsZTovLy9Vc2Vycy9qb2hua2VsbGVyL015JTIwTWFjJTIwKEpvaG5zLU1hY0Jvb2stUHJvLmxvY2FsKS9NYWluL05YVDEvbnh0MS1tb25vcmVwby9wYWNrYWdlcy9jb3JlL3RzdXAuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndHN1cCc7XG5pbXBvcnQgeyByZWFkZGlyLCByZWFkRmlsZSwgd3JpdGVGaWxlIH0gZnJvbSAnbm9kZTpmcy9wcm9taXNlcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnbm9kZTpwYXRoJztcblxuLyoqXG4gKiBQb3N0LWJ1aWxkOiBhZGQgLmpzIGV4dGVuc2lvbnMgdG8gcmVsYXRpdmUgaW1wb3J0cyBpbiBFU00gb3V0cHV0LlxuICogTm9kZS5qcyBFU00gcmVxdWlyZXMgZXhwbGljaXQgZmlsZSBleHRlbnNpb25zLCBidXQgZXNidWlsZCBjb2RlIHNwbGl0dGluZ1xuICogZW1pdHMgYmFyZSBzcGVjaWZpZXJzIGxpa2UgYGZyb20gJy4vZXJyb3IudHlwZXMnYC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZml4RXNtSW1wb3J0cyhkaXI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBlbnRyaWVzID0gYXdhaXQgcmVhZGRpcihkaXIsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcbiAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG4gICAgY29uc3QgZnVsbFBhdGggPSBqb2luKGRpciwgZW50cnkubmFtZSk7XG4gICAgaWYgKGVudHJ5LmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgIGF3YWl0IGZpeEVzbUltcG9ydHMoZnVsbFBhdGgpO1xuICAgIH0gZWxzZSBpZiAoZW50cnkubmFtZS5lbmRzV2l0aCgnLmpzJykpIHtcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkRmlsZShmdWxsUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBjb25zdCBmaXhlZCA9IGNvbnRlbnQucmVwbGFjZShcbiAgICAgICAgLygoPzpmcm9tfGltcG9ydClcXHMqWydcIl0pKFxcLlxcLj9cXC9bXidcIl0rPykoWydcIl0pL2csXG4gICAgICAgIChfbWF0Y2gsIHByZWZpeDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHN1ZmZpeDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGhhcyBhIGtub3duIGZpbGUgZXh0ZW5zaW9uXG4gICAgICAgICAgaWYgKC9cXC4oanN8Y2pzfG1qc3xqc29ufGNzc3x3YXNtfG5vZGUpJC8udGVzdChwYXRoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3ByZWZpeH0ke3BhdGh9JHtzdWZmaXh9YDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3ByZWZpeH0ke3BhdGh9LmpzJHtzdWZmaXh9YDtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIGlmIChmaXhlZCAhPT0gY29udGVudCkge1xuICAgICAgICBhd2FpdCB3cml0ZUZpbGUoZnVsbFBhdGgsIGZpeGVkLCAndXRmLTgnKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgZW50cnk6IFtcbiAgICAnc3JjL2luZGV4LnRzJyxcbiAgICAnc3JjLyovaW5kZXgudHMnLFxuICAgICdzcmMvZXJyb3JzL2V4cHJlc3MubWlkZGxld2FyZS50cycsXG4gICAgJ3NyYy90ZXN0aW5nL2F1dGgtZml4dHVyZXMudHMnLFxuICAgICdzcmMvdGVzdGluZy9hdXRoLW1vY2tzLnRzJyxcbiAgICAnc3JjL3Rlc3RpbmcvdGVzdC1kYXRhLnRzJyxcbiAgXSxcbiAgZm9ybWF0OiBbJ2NqcycsICdlc20nXSxcbiAgb3V0RXh0ZW5zaW9uKHsgZm9ybWF0IH0pIHtcbiAgICByZXR1cm4geyBqczogZm9ybWF0ID09PSAnY2pzJyA/ICcuY2pzJyA6ICcuanMnIH07XG4gIH0sXG4gIGR0czogZmFsc2UsXG4gIC8vIEVuYWJsZSBzcGxpdHRpbmcgdG8gZGVkdXBsaWNhdGUgc2hhcmVkIGNvZGUgYWNyb3NzIGVudHJ5IHBvaW50c1xuICAvLyBUaGlzIHByZXZlbnRzIGR1YWwtcGFja2FnZSBpc3N1ZXMgd2hlcmUgY2xhc3NlcyBsaWtlIE54dEFwaUVycm9yXG4gIC8vIGdldCBidW5kbGVkIG11bHRpcGxlIHRpbWVzIGNhdXNpbmcgaW5zdGFuY2VvZiBjaGVja3MgdG8gZmFpbFxuICBzcGxpdHRpbmc6IHRydWUsXG4gIHNvdXJjZW1hcDogdHJ1ZSxcbiAgY2xlYW46ICFwcm9jZXNzLmFyZ3YuaW5jbHVkZXMoJy0td2F0Y2gnKSxcbiAgb3V0RGlyOiAnZGlzdCcsXG4gIC8vIEV4Y2x1ZGUgQW5ndWxhci9Jb25pYyBkZXBlbmRlbnQgZmlsZXMgLSB0aGVzZSBoYXZlIG1vdmVkIHRvIEBueHQxL3VpXG4gIGV4dGVybmFsOiBbJ0Bhbmd1bGFyLyonLCAnQGlvbmljLyonLCAnaW9uaWNvbnMnXSxcbiAgYXN5bmMgb25TdWNjZXNzKCkge1xuICAgIGF3YWl0IGZpeEVzbUltcG9ydHMoJ2Rpc3QnKTtcbiAgICBjb25zb2xlLmxvZygnXHUyNzA1IEZpeGVkIEVTTSByZWxhdGl2ZSBpbXBvcnQgZXh0ZW5zaW9ucycpO1xuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTBaLFNBQVMsb0JBQW9CO0FBQ3ZiLFNBQVMsU0FBUyxVQUFVLGlCQUFpQjtBQUM3QyxTQUFTLFlBQVk7QUFPckIsZUFBZSxjQUFjLEtBQTRCO0FBQ3ZELFFBQU0sVUFBVSxNQUFNLFFBQVEsS0FBSyxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQzFELGFBQVcsU0FBUyxTQUFTO0FBQzNCLFVBQU0sV0FBVyxLQUFLLEtBQUssTUFBTSxJQUFJO0FBQ3JDLFFBQUksTUFBTSxZQUFZLEdBQUc7QUFDdkIsWUFBTSxjQUFjLFFBQVE7QUFBQSxJQUM5QixXQUFXLE1BQU0sS0FBSyxTQUFTLEtBQUssR0FBRztBQUNyQyxZQUFNLFVBQVUsTUFBTSxTQUFTLFVBQVUsT0FBTztBQUNoRCxZQUFNLFFBQVEsUUFBUTtBQUFBLFFBQ3BCO0FBQUEsUUFDQSxDQUFDLFFBQVEsUUFBZ0IsTUFBYyxXQUFtQjtBQUV4RCxjQUFJLHFDQUFxQyxLQUFLLElBQUksR0FBRztBQUNuRCxtQkFBTyxHQUFHLE1BQU0sR0FBRyxJQUFJLEdBQUcsTUFBTTtBQUFBLFVBQ2xDO0FBQ0EsaUJBQU8sR0FBRyxNQUFNLEdBQUcsSUFBSSxNQUFNLE1BQU07QUFBQSxRQUNyQztBQUFBLE1BQ0Y7QUFDQSxVQUFJLFVBQVUsU0FBUztBQUNyQixjQUFNLFVBQVUsVUFBVSxPQUFPLE9BQU87QUFBQSxNQUMxQztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0Y7QUFFQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixPQUFPO0FBQUEsSUFDTDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUSxDQUFDLE9BQU8sS0FBSztBQUFBLEVBQ3JCLGFBQWEsRUFBRSxPQUFPLEdBQUc7QUFDdkIsV0FBTyxFQUFFLElBQUksV0FBVyxRQUFRLFNBQVMsTUFBTTtBQUFBLEVBQ2pEO0FBQUEsRUFDQSxLQUFLO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFJTCxXQUFXO0FBQUEsRUFDWCxXQUFXO0FBQUEsRUFDWCxPQUFPLENBQUMsUUFBUSxLQUFLLFNBQVMsU0FBUztBQUFBLEVBQ3ZDLFFBQVE7QUFBQTtBQUFBLEVBRVIsVUFBVSxDQUFDLGNBQWMsWUFBWSxVQUFVO0FBQUEsRUFDL0MsTUFBTSxZQUFZO0FBQ2hCLFVBQU0sY0FBYyxNQUFNO0FBQzFCLFlBQVEsSUFBSSw2Q0FBd0M7QUFBQSxFQUN0RDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
