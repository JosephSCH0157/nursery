module.exports = {
	testEnvironment: 'jsdom',
	testMatch: [
		'**/tests/ui/**/*.test.ts',
		'**/tests/recording/**/*.test.ts',
		'**/tests/adapters/**/*.test.ts',
		'**/tests/hud/**/*.test.ts'
	],
	setupFiles: ['<rootDir>/tests/setup-jest.ts'],
	setupFilesAfterEnv: ['<rootDir>/tests/setup-after-env.ts'],
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{ tsconfig: 'tsconfig.json', useESM: true }
		]
	},
	extensionsToTreatAsEsm: ['.ts'],
	moduleFileExtensions: ['ts','tsx','js','jsx','json'],
	verbose: false,
	// ASR fake-clock suites advance dense controller polling loops. Unbounded
	// host-core fanout causes CPU starvation and wall-clock test timeouts even
	// though the same deterministic work passes under controlled parallelism.
	maxWorkers: 2,
	testTimeout: 15000,
  testPathIgnorePatterns: ['<rootDir>/.worktrees/']
};
