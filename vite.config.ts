import { defineConfig } from "vite";

const repoName = "map-space";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : `/${repoName}/`,
}));
