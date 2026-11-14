import jsdoc from "eslint-plugin-jsdoc";
import babelParser from "@babel/eslint-parser";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/public/**",
      "**/data/**",
      "**/*.d.ts",
      "**/*.config.{js,mjs,ts}",
      "eslint.config.mjs",
    ],
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        requireConfigFile: false,
        ecmaFeatures: { jsx: true },
        babelOptions: {
          presets: [
            ["@babel/preset-typescript"],
            ["@babel/preset-react", { runtime: "automatic" }],
          ],
        },
      },
    },
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            FunctionExpression: true,
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            MethodDefinition: true,
          },
        },
      ],
      "jsdoc/require-description": "error",
      "jsdoc/check-param-names": "error",
    },
  },
];
