// docs/spec/phase-12.md §7.2: the product name must not reach the app's source, config, flows or
// asset names. Pure over the tracked file list and a reader, so the test needs no git and no disk.

const NAME = /granola/i;

const CONTENT_SCOPES = [
  /^apps\/[^/]+\/src\//,
  /^packages\/[^/]+\/src\//,
  /^apps\/native\/app\.json$/,
  /^apps\/native\/app\.config\.ts$/,
  /^apps\/native\/\.maestro\//,
];

const ASSET_SCOPE = /^apps\/native\/assets\//;

const inContentScope = (path) =>
  CONTENT_SCOPES.some((scope) => scope.test(path));

const contentLeaks = (path, read) =>
  read(path)
    .split("\n")
    .flatMap((line, index) =>
      NAME.test(line) ? [`${path}:${index + 1}: ${line.trim()}`] : []
    );

export const findBrandingLeaks = (tracked, read) =>
  tracked.flatMap((path) => {
    if (ASSET_SCOPE.test(path)) {
      return NAME.test(path)
        ? [`${path}: asset file name carries the product name`]
        : [];
    }
    return inContentScope(path) ? contentLeaks(path, read) : [];
  });
