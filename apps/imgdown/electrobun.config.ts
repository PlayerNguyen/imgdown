import type { ElectrobunConfig } from "electrobun";

const config = {
  app: {
    name: "ImgDown",
    identifier: "dev.imgdown.app",
    version: "1.0.0",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "desktop/bun/index.ts",
    },
    copy: {
      "public/app.js": "views/public/app.js",
      "public/styles.css": "views/public/styles.css",
    },
  },
} satisfies ElectrobunConfig;

export default config;
