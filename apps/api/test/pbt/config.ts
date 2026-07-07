import fc from 'fast-check';

/**
 * Property-based testing configuration.
 * Per design doc: minimum 100 iterations per property.
 */
export const PBT_CONFIG: fc.Parameters<unknown> = {
  numRuns: 100,
  verbose: fc.VerbosityLevel.None,
};

/**
 * Extended PBT config for critical properties (billing, auth).
 * More iterations = higher confidence.
 */
export const PBT_CONFIG_EXTENDED: fc.Parameters<unknown> = {
  numRuns: 500,
  verbose: fc.VerbosityLevel.None,
};

/**
 * Quick PBT config for development/debugging.
 */
export const PBT_CONFIG_QUICK: fc.Parameters<unknown> = {
  numRuns: 20,
  verbose: fc.VerbosityLevel.VeryVerbose,
};
