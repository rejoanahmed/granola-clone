/**
 * Deliberately bare.
 *
 * eventsbd is a bun workspace and every `@evb/*` package exports its TypeScript source
 * (`"./*": "./src/*.ts"`), so Metro has to reach outside `apps/native` to resolve them. It already
 * does: Expo 57's default config walks up to the workspace root on its own and follows symlinks.
 * The `watchFolders` / `nodeModulesPaths` incantation that older monorepo guides prescribe is not
 * only unnecessary here, it shadows the defaults and is the usual cause of "Unable to resolve
 * module @evb/apiclient" in a monorepo that was working the day before.
 *
 * Add to this file only when you have a resolution failure the default cannot explain.
 */
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
