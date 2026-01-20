/**
 * Utilities Module Exports
 */

export {
  detectLanguage,
  isSupportedFile,
  getExtensionsForLanguage,
  extractSymbols,
  isComment,
  extractDocComment,
  getLanguageDisplayName,
} from './language.js';

export {
  PatternMatcher,
  loadGitignore,
  discoverFiles,
  computeFileHash,
  readFileContent,
  fileExists,
  ensureDirectory,
  getRelativePath,
  resolveAbsolutePath,
  type DiscoveredFile,
  type DiscoveryOptions,
} from './files.js';
