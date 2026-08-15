/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          target: 'ES2020',
          lib: ['ES2020', 'DOM'],
          strict: true,
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
  collectCoverageFrom: ['src/utils/**/*.ts', 'src/lib/**/*.ts', '!src/**/__tests__/**'],
};
