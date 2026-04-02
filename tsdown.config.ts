import { defineConfig, type UserConfig } from 'tsdown';

const _default: UserConfig = defineConfig({
	entry: ['./src/index.ts'],
	format: ['esm'],
	// dts: false,
	dts: {
		// resolver: 'tsc',
		// resolver: 'tsc',
		sourcemap: false,
	},
	clean: true,
	// deps: {
	// 	alwaysBundle: [
	// 		'node:fs',
	// 		'node:crypto',
	// 		'node:path',
	// 		'util',
	// 		'os',
	// 		'chalk',
	// 		'@types/babel__generator',
	// 		'@types/babel__traverse',
	// 		'@types/node',
	// 		'@babel/generator',
	// 		'@babel/parser',
	// 		'@babel/traverse',
	// 		'@babel/types',
	// 		'fast-glob',
	// 		'webpack',
	// 	],
	// },
	exports: true,
});
export default _default;
