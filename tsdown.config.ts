import { defineConfig, type UserConfig } from 'tsdown';

const _default: UserConfig = defineConfig({
	entry: ['./src/index.ts'],
	format: ['esm'],
	dts: {
		resolver: 'tsc',
		sourcemap: true,
	},
	clean: true,
	exports: true,
	deps: {
		alwaysBundle: [
			'chalk',
			'@babel/types',
			'@babel/traverse',
			'@babel/parser',
			'@babel/generator',
			'fast-glob',
		],
		neverBundle: ['webpack'],
	},
});
export default _default;
