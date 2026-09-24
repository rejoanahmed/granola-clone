/**
 * `react-native-worklets/plugin` must be LAST in the plugin list — it rewrites the worklet
 * functions other plugins may still be producing. Reanimated 4 no longer ships its own babel
 * plugin; worklets is the one, and omitting it fails at runtime ("Reanimated is not configured
 * correctly") rather than at build time.
 */
module.exports = (api) => {
  api.cache(true);
  return {
    plugins: ["react-native-worklets/plugin"],
    presets: ["babel-preset-expo"],
  };
};
