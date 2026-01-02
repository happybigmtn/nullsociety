const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');
const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = getDefaultConfig(projectRoot);

// Enable CSS support for web
config.resolver.sourceExts.push('css');
// Enable package exports so workspace subpath exports resolve correctly.
config.resolver.unstable_enablePackageExports = true;

// Watch the monorepo root for workspace packages while keeping Expo defaults.
const defaultWatchFolders = config.watchFolders ?? [];
config.watchFolders = Array.from(new Set([...defaultWatchFolders, monorepoRoot]));

// Resolve node_modules from both project and monorepo root while preserving defaults.
const defaultNodeModulesPaths = config.resolver.nodeModulesPaths ?? [];
config.resolver.nodeModulesPaths = Array.from(
  new Set([
    ...defaultNodeModulesPaths,
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
  ])
);

const targetPath = escapeForRegExp(path.resolve(monorepoRoot, 'target'));
config.resolver.blockList = [
  new RegExp(`${targetPath}([/\\\\].*)?$`),
];

module.exports = config;
