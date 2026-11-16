export default {
  electrobun: {
    version: "2.0.6",
  },
  packageManager: "bun",
  scripts: {
    install: ["bun", "install", "--frozen-lockfile"],
    dev: ["hutch", "electrobun", "dev", "--watch"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
