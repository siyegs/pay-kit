import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    next: "src/adapters/next.ts",
    nestjs: "src/adapters/nestjs.ts",
    express: "src/adapters/express.ts",
    hono: "src/adapters/hono.ts",
    fastify: "src/adapters/fastify.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  minify: false,
});
