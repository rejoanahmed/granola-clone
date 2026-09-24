/**
 * The harness, not a suite.
 *
 * `docs/TESTING.md` puts every rule worth asserting in `packages/server` where it runs in
 * milliseconds against memory doubles, so this app ships no tests of its own. What it ships is a
 * runner that already works, so the first person to add a screen test does not also have to
 * discover that `jest-expo` needs `setup.ts` to stub the native modules.
 *
 * `jest` and `jest-expo` are intentionally NOT dependencies: the spec's version table pins
 * neither, and `package.json` therefore declares no `test` script, so `turbo test` skips this
 * package. Add both (via `expo install jest-expo jest`) together with the script when you write
 * the first suite.
 *
 * @type {import("@jest/types").Config.ProjectConfig}
 */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/test/setup.ts"],
};
