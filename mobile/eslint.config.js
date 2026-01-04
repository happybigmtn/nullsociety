const { FlatCompat } = require("@eslint/eslintrc");
const globals = require("globals");

const compat = new FlatCompat({ baseDirectory: __dirname });
const expoConfig = compat.extends("expo").map((config) => ({
  ...config,
  files: config.files ?? ["**/*.{js,jsx,ts,tsx}"],
}));

const testFiles = [
  "**/__tests__/**/*.{js,jsx,ts,tsx}",
  "**/*.{spec,test}.{js,jsx,ts,tsx}",
  "**/__mocks__/**/*.{js,jsx,ts,tsx}",
  "src/test-utils/**/*.{js,jsx,ts,tsx}",
  "jest/setup.{js,ts}",
];

module.exports = [
  {
    ignores: [
      "node_modules",
      "dist",
      "build",
      "coverage",
      ".expo",
      "android",
      "ios",
      "eslint.config.js",
    ],
  },
  ...expoConfig,
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
