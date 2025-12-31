const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({ baseDirectory: __dirname });
const expoConfig = compat.extends("expo").map((config) => ({
  ...config,
  files: config.files ?? ["**/*.{js,jsx,ts,tsx}"],
}));

module.exports = [
  {
    ignores: [
      "node_modules",
      "dist",
      "build",
      "coverage",
      "android",
      "ios",
      "eslint.config.js",
    ],
  },
  ...expoConfig,
];
