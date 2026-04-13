export default [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];
