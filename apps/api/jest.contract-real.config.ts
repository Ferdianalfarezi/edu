import type { Config } from 'jest';

const config: Config = {
  displayName: 'contract-real',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.contract\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
};

export default config;
