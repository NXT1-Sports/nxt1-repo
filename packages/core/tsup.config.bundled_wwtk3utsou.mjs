// tsup.config.ts
import { defineConfig } from "tsup";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function fixEsmImports(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await fixEsmImports(fullPath);
    } else if (entry.name.endsWith(".js")) {
      let content;
      try {
        content = await readFile(fullPath, "utf-8");
      } catch (error) {
        if (error.code === "ENOENT") {
          continue;
        }
        throw error;
      }
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
        try {
          await writeFile(fullPath, fixed, "utf-8");
        } catch (error) {
          if (error.code === "ENOENT") {
            continue;
          }
          throw error;
        }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidHN1cC5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9faW5qZWN0ZWRfZmlsZW5hbWVfXyA9IFwiL1VzZXJzL3NvdGF0ZWsvRG93bmxvYWRzL1NvdXJjZV9Db2RlL05YVDEvbnh0MS1yZXBvL3BhY2thZ2VzL2NvcmUvdHN1cC5jb25maWcudHNcIjtjb25zdCBfX2luamVjdGVkX2Rpcm5hbWVfXyA9IFwiL1VzZXJzL3NvdGF0ZWsvRG93bmxvYWRzL1NvdXJjZV9Db2RlL05YVDEvbnh0MS1yZXBvL3BhY2thZ2VzL2NvcmVcIjtjb25zdCBfX2luamVjdGVkX2ltcG9ydF9tZXRhX3VybF9fID0gXCJmaWxlOi8vL1VzZXJzL3NvdGF0ZWsvRG93bmxvYWRzL1NvdXJjZV9Db2RlL05YVDEvbnh0MS1yZXBvL3BhY2thZ2VzL2NvcmUvdHN1cC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd0c3VwJztcbmltcG9ydCB7IHJlYWRkaXIsIHJlYWRGaWxlLCB3cml0ZUZpbGUgfSBmcm9tICdub2RlOmZzL3Byb21pc2VzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICdub2RlOnBhdGgnO1xuXG4vKipcbiAqIFBvc3QtYnVpbGQ6IGFkZCAuanMgZXh0ZW5zaW9ucyB0byByZWxhdGl2ZSBpbXBvcnRzIGluIEVTTSBvdXRwdXQuXG4gKiBOb2RlLmpzIEVTTSByZXF1aXJlcyBleHBsaWNpdCBmaWxlIGV4dGVuc2lvbnMsIGJ1dCBlc2J1aWxkIGNvZGUgc3BsaXR0aW5nXG4gKiBlbWl0cyBiYXJlIHNwZWNpZmllcnMgbGlrZSBgZnJvbSAnLi9lcnJvci50eXBlcydgLlxuICovXG5hc3luYyBmdW5jdGlvbiBmaXhFc21JbXBvcnRzKGRpcjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGxldCBlbnRyaWVzO1xuICB0cnkge1xuICAgIGVudHJpZXMgPSBhd2FpdCByZWFkZGlyKGRpciwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmICgoZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlID09PSAnRU5PRU5UJykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgIGNvbnN0IGZ1bGxQYXRoID0gam9pbihkaXIsIGVudHJ5Lm5hbWUpO1xuICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICBhd2FpdCBmaXhFc21JbXBvcnRzKGZ1bGxQYXRoKTtcbiAgICB9IGVsc2UgaWYgKGVudHJ5Lm5hbWUuZW5kc1dpdGgoJy5qcycpKSB7XG4gICAgICBsZXQgY29udGVudDogc3RyaW5nO1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29udGVudCA9IGF3YWl0IHJlYWRGaWxlKGZ1bGxQYXRoLCAndXRmLTgnKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGlmICgoZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlID09PSAnRU5PRU5UJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBmaXhlZCA9IGNvbnRlbnQucmVwbGFjZShcbiAgICAgICAgLygoPzpmcm9tfGltcG9ydClcXHMqWydcIl0pKFxcLlxcLj9cXC9bXidcIl0rPykoWydcIl0pL2csXG4gICAgICAgIChfbWF0Y2gsIHByZWZpeDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIHN1ZmZpeDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgLy8gU2tpcCBpZiBhbHJlYWR5IGhhcyBhIGtub3duIGZpbGUgZXh0ZW5zaW9uXG4gICAgICAgICAgaWYgKC9cXC4oanN8Y2pzfG1qc3xqc29ufGNzc3x3YXNtfG5vZGUpJC8udGVzdChwYXRoKSkge1xuICAgICAgICAgICAgcmV0dXJuIGAke3ByZWZpeH0ke3BhdGh9JHtzdWZmaXh9YDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAke3ByZWZpeH0ke3BhdGh9LmpzJHtzdWZmaXh9YDtcbiAgICAgICAgfVxuICAgICAgKTtcbiAgICAgIGlmIChmaXhlZCAhPT0gY29udGVudCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHdyaXRlRmlsZShmdWxsUGF0aCwgZml4ZWQsICd1dGYtOCcpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGlmICgoZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlID09PSAnRU5PRU5UJykge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIGVudHJ5OiBbXG4gICAgJ3NyYy9pbmRleC50cycsXG4gICAgJ3NyYy8qL2luZGV4LnRzJyxcbiAgICAnc3JjL2Vycm9ycy9leHByZXNzLm1pZGRsZXdhcmUudHMnLFxuICAgICdzcmMvdGVzdGluZy9hdXRoLWZpeHR1cmVzLnRzJyxcbiAgICAnc3JjL3Rlc3RpbmcvYXV0aC1tb2Nrcy50cycsXG4gICAgJ3NyYy90ZXN0aW5nL3Rlc3QtZGF0YS50cycsXG4gIF0sXG4gIGZvcm1hdDogWydjanMnLCAnZXNtJ10sXG4gIG91dEV4dGVuc2lvbih7IGZvcm1hdCB9KSB7XG4gICAgcmV0dXJuIHsganM6IGZvcm1hdCA9PT0gJ2NqcycgPyAnLmNqcycgOiAnLmpzJyB9O1xuICB9LFxuICBkdHM6IGZhbHNlLFxuICAvLyBFbmFibGUgc3BsaXR0aW5nIHRvIGRlZHVwbGljYXRlIHNoYXJlZCBjb2RlIGFjcm9zcyBlbnRyeSBwb2ludHNcbiAgLy8gVGhpcyBwcmV2ZW50cyBkdWFsLXBhY2thZ2UgaXNzdWVzIHdoZXJlIGNsYXNzZXMgbGlrZSBOeHRBcGlFcnJvclxuICAvLyBnZXQgYnVuZGxlZCBtdWx0aXBsZSB0aW1lcyBjYXVzaW5nIGluc3RhbmNlb2YgY2hlY2tzIHRvIGZhaWxcbiAgc3BsaXR0aW5nOiB0cnVlLFxuICBzb3VyY2VtYXA6IHRydWUsXG4gIGNsZWFuOiAhcHJvY2Vzcy5hcmd2LmluY2x1ZGVzKCctLXdhdGNoJyksXG4gIG91dERpcjogJ2Rpc3QnLFxuICAvLyBFeGNsdWRlIEFuZ3VsYXIvSW9uaWMgZGVwZW5kZW50IGZpbGVzIC0gdGhlc2UgaGF2ZSBtb3ZlZCB0byBAbnh0MS91aVxuICBleHRlcm5hbDogWydAYW5ndWxhci8qJywgJ0Bpb25pYy8qJywgJ2lvbmljb25zJ10sXG4gIGFzeW5jIG9uU3VjY2VzcygpIHtcbiAgICBhd2FpdCBmaXhFc21JbXBvcnRzKCdkaXN0Jyk7XG4gICAgY29uc29sZS5sb2coJ1x1MjcwNSBGaXhlZCBFU00gcmVsYXRpdmUgaW1wb3J0IGV4dGVuc2lvbnMnKTtcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpVixTQUFTLG9CQUFvQjtBQUM5VyxTQUFTLFNBQVMsVUFBVSxpQkFBaUI7QUFDN0MsU0FBUyxZQUFZO0FBT3JCLGVBQWUsY0FBYyxLQUE0QjtBQUN2RCxNQUFJO0FBQ0osTUFBSTtBQUNGLGNBQVUsTUFBTSxRQUFRLEtBQUssRUFBRSxlQUFlLEtBQUssQ0FBQztBQUFBLEVBQ3RELFNBQVMsT0FBTztBQUNkLFFBQUssTUFBZ0MsU0FBUyxVQUFVO0FBQ3REO0FBQUEsSUFDRjtBQUNBLFVBQU07QUFBQSxFQUNSO0FBRUEsYUFBVyxTQUFTLFNBQVM7QUFDM0IsVUFBTSxXQUFXLEtBQUssS0FBSyxNQUFNLElBQUk7QUFDckMsUUFBSSxNQUFNLFlBQVksR0FBRztBQUN2QixZQUFNLGNBQWMsUUFBUTtBQUFBLElBQzlCLFdBQVcsTUFBTSxLQUFLLFNBQVMsS0FBSyxHQUFHO0FBQ3JDLFVBQUk7QUFDSixVQUFJO0FBQ0Ysa0JBQVUsTUFBTSxTQUFTLFVBQVUsT0FBTztBQUFBLE1BQzVDLFNBQVMsT0FBTztBQUNkLFlBQUssTUFBZ0MsU0FBUyxVQUFVO0FBQ3REO0FBQUEsUUFDRjtBQUNBLGNBQU07QUFBQSxNQUNSO0FBRUEsWUFBTSxRQUFRLFFBQVE7QUFBQSxRQUNwQjtBQUFBLFFBQ0EsQ0FBQyxRQUFRLFFBQWdCLE1BQWMsV0FBbUI7QUFFeEQsY0FBSSxxQ0FBcUMsS0FBSyxJQUFJLEdBQUc7QUFDbkQsbUJBQU8sR0FBRyxNQUFNLEdBQUcsSUFBSSxHQUFHLE1BQU07QUFBQSxVQUNsQztBQUNBLGlCQUFPLEdBQUcsTUFBTSxHQUFHLElBQUksTUFBTSxNQUFNO0FBQUEsUUFDckM7QUFBQSxNQUNGO0FBQ0EsVUFBSSxVQUFVLFNBQVM7QUFDckIsWUFBSTtBQUNGLGdCQUFNLFVBQVUsVUFBVSxPQUFPLE9BQU87QUFBQSxRQUMxQyxTQUFTLE9BQU87QUFDZCxjQUFLLE1BQWdDLFNBQVMsVUFBVTtBQUN0RDtBQUFBLFVBQ0Y7QUFDQSxnQkFBTTtBQUFBLFFBQ1I7QUFBQSxNQUNGO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRjtBQUVBLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLE9BQU87QUFBQSxJQUNMO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNGO0FBQUEsRUFDQSxRQUFRLENBQUMsT0FBTyxLQUFLO0FBQUEsRUFDckIsYUFBYSxFQUFFLE9BQU8sR0FBRztBQUN2QixXQUFPLEVBQUUsSUFBSSxXQUFXLFFBQVEsU0FBUyxNQUFNO0FBQUEsRUFDakQ7QUFBQSxFQUNBLEtBQUs7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUlMLFdBQVc7QUFBQSxFQUNYLFdBQVc7QUFBQSxFQUNYLE9BQU8sQ0FBQyxRQUFRLEtBQUssU0FBUyxTQUFTO0FBQUEsRUFDdkMsUUFBUTtBQUFBO0FBQUEsRUFFUixVQUFVLENBQUMsY0FBYyxZQUFZLFVBQVU7QUFBQSxFQUMvQyxNQUFNLFlBQVk7QUFDaEIsVUFBTSxjQUFjLE1BQU07QUFDMUIsWUFBUSxJQUFJLDZDQUF3QztBQUFBLEVBQ3REO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
