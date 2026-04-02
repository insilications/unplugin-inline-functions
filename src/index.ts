import { parse } from '@babel/parser';
import { createHash } from 'node:crypto';
import fg from 'fast-glob';
import fs from 'node:fs';
// import path from 'node:path';
// import util from 'node:util';
import chalk from 'chalk';
import { STATS } from './stats';
import { collectMetadata, resetMetadata } from './collect-metadata';
import { inlineFunctions } from './inline-functions';
// import { STATS } from './stats';
import { discoverFilesViaReferences } from './utils/discover-files';
import { findProjectRoot } from './utils/find-project-root';
import { type LoaderContext } from 'webpack';
// import { type LoaderDefinitionFunction } from 'webpack';
// import {
// 	inlinableFunctions,
// 	inlinableFunctionCalls,
// 	pureFunctions,
// 	callsiteInlineCandidates,
// } from './collect-metadata';

export interface InlineFunctionsOptions {
	/**
	 * Glob patterns to include for metadata collection.
	 * These files will be scanned for @inline and @pure decorators.
	 * Similar to tsconfig.json's "include" field.
	 *
	 * @default ['src/**\/*.{js,ts,jsx,tsx}']
	 * @example ['src/utils/**\/*.ts', 'src/lib/**\/*.ts']
	 */
	include?: string | string[];

	/**
	 * Glob patterns to exclude from metadata collection.
	 *
	 * @default ['node_modules/**', '**\/*.spec.ts', '**\/*.test.ts']
	 */
	exclude?: string | string[];

	/**
	 * Base directory for resolving glob patterns.
	 *
	 * @default process.cwd()
	 */
	cwd?: string;

	/**
	 * Enable debug logging to help diagnose issues.
	 * - `true`: Shows consolidated summary information
	 * - `'verbose'`: Shows detailed verbose logging
	 *
	 * @default false
	 */
	debug?: boolean | 'verbose';

	/**
	 * Automatically discover files via `export * from` and `export { ... } from` statements.
	 * When enabled, files matching the include pattern will be scanned for export statements,
	 * and the referenced files will be automatically included in metadata collection.
	 *
	 * @default true
	 */
	followExports?: boolean;

	/**
	 * Automatically discover files via `import` statements.
	 *
	 * - `false` or `'none'`: Don't follow imports (default)
	 * - `'side-effects'`: Only follow side-effect imports (e.g., `import './patch'`)
	 * - `'all'` or `true`: Follow all relative imports
	 *
	 * @default true
	 * @example
	 * // Only follow side-effect imports (for patch files)
	 * followImports: 'side-effects'
	 *
	 * // Follow all imports (more aggressive, may discover more files)
	 * followImports: 'all'
	 */
	followImports?: boolean | 'side-effects' | 'all' | 'none';
}

// Module-level state — shared across all loader invocations in a build
let initialized = false;
const astCache = new Map<string, any>();
const codeCache = new Map<string, string>();
const dependencyPaths = new Set<string>();

/**
 * Log statistics about inlined functions.
 */
function logStats(loader_context: LoaderContext<InlineFunctionsOptions>) {
	const counts = Array.from(STATS.getAllInlinedFunctionCounts()).filter(
		([name]) => name.trim() !== ''
	);
	if (counts.length > 0) {
		console.log(chalk.green('\n✓ Inlined functions:'));
		for (const [name, count] of counts) {
			console.log(`  ${chalk.cyan(name)}: ${chalk.bold(count)}`);
		}
	}

	const functions = Array.from(STATS.getAllTransformedFunctions()).filter(
		([name]) => name.trim() !== ''
	);

	if (functions.length > 0) {
		console.log(chalk.green('\n✓ Transformed functions:'));
		// Group functions into lines of 4.
		// const chunkSize = 4;
		// // Calculate max width for each column.
		// const columnWidths = Array(chunkSize).fill(0);
		// for (let i = 0; i < functions.length; i++) {
		// 	const col = i % chunkSize;
		// 	const [name, { isPure, absoluteFilePath }] = functions[i];
		// 	// Account for 2 extra characters if the function is pure (space + star)
		// 	columnWidths[col] = Math.max(
		// 		columnWidths[col],
		// 		name.length + (absoluteFilePath ? absoluteFilePath.length + 3 : 10) + (isPure ? 2 : 0)
		// 	);
		// }
		// // Print in grid format.
		// for (let i = 0; i < functions.length; i += chunkSize) {
		// 	const chunk = functions.slice(i, i + chunkSize);
		// 	const paddedChunk = chunk.map(([name, { isPure, absoluteFilePath }], idx) =>
		// 		(isPure ? chalk.yellow : chalk.cyan)(
		// 			`${name}${absoluteFilePath ? ` (${absoluteFilePath})` : ` (unknown)`}${isPure ? ' ★' : ''}`.padEnd(
		// 				columnWidths[idx]
		// 			)
		// 		)
		// 	);
		// 	console.log(`  ${paddedChunk.join('  ')}`);
		// }

		// Print in grid format.
		for (let i = 0, functionsLen = functions.length; i < functionsLen; ++i) {
			const func = functions[i];
			const [name, { isPure, absoluteFilePath }] = func;
			if (absoluteFilePath) {
				dependencyPaths.add(absoluteFilePath);
			}
			const paddedName = `${name}${absoluteFilePath ? ` (${absoluteFilePath})` : ` (unknown)`}${
				isPure ? ' ★' : ''
			}`;
			// const paddedChunk = chalk[isPure ? 'yellow' : 'cyan'](paddedName);
			// const paddedChunk = chalk[isPure ? 'yellow' : 'cyan'](
			// 	`${name}${absoluteFilePath ? ` (${absoluteFilePath})` : ` (unknown)`}${isPure ? ' ★' : ''}`
			// );
			// const chunk = functions.slice(i, i + chunkSize);
			// const paddedChunk = chunk.map(([name, { isPure, absoluteFilePath }], idx) =>
			// 	(isPure ? chalk.yellow : chalk.cyan)(
			// 		`${name}${absoluteFilePath ? ` (${absoluteFilePath})` : ` (unknown)`}${isPure ? ' ★' : ''}`.padEnd(
			// 			columnWidths[idx]
			// 		)
			// 	)
			// );
			console.log(chalk[isPure ? 'yellow' : 'cyan'](paddedName));
		}
		console.log('');
	}

	for (const dep of dependencyPaths) {
		loader_context.addDependency(dep);
	}
}

function hashContent(content: string): string {
	return createHash('md5').update(content).digest('hex');
}

export function scanAndCollectMetadata(options: InlineFunctionsOptions): void {
	if (initialized) {
		console.log(
			`scanAndCollectMetadata - ALREADY INITIALIZED - ${Math.random().toString(36).substring(2, 10)}`
		);
		return;
	}
	console.log(
		`scanAndCollectMetadata - INITIALIZING - ${Math.random().toString(36).substring(2, 10)}`
	);
	// Should we set `initialized = true` here at the top-level or should I wait until the scan/collection has actually been successfully completed?
	initialized = true;

	const {
		include = ['src/**/*.ts'],
		// include = ['src/**/*.{js,ts,jsx,tsx}'],
		exclude = ['node_modules/**', '**/*.spec.ts', '**/*.test.ts'],
		cwd = process.cwd(),
		debug = false,
		followExports = true,
		followImports = true,
	} = options;

	// console.log('scanAndCollectMetadata - options: ', options);

	// Reset state
	STATS.reset();
	resetMetadata();
	astCache.clear();
	codeCache.clear();

	const projectRoot = findProjectRoot(cwd);
	const includePatterns = Array.isArray(include) ? include : [include];
	const excludePatterns = Array.isArray(exclude) ? exclude : [exclude];

	const initialFiles = new Set(
		fg.sync(includePatterns, {
			cwd: projectRoot,
			ignore: excludePatterns,
			absolute: true,
			onlyFiles: true,
		})
	);

	const { files } = discoverFilesViaReferences(initialFiles, {
		projectRoot,
		excludePatterns,
		debug,
		followExports: followExports || false,
		followImports,
	});

	for (const filePath of files) {
		// if (!/\.(js|ts|jsx|tsx)$/.test(filePath)) continue;
		if (!/\.ts$/.test(filePath)) continue;
		try {
			const contents = fs.readFileSync(filePath, 'utf8');
			const hash = hashContent(contents);
			const ast = parse(contents, {
				sourceType: 'module',
				plugins: ['typescript'],
				// plugins: ['typescript', 'jsx'],
				sourceFilename: filePath,
			});
			astCache.set(hash, ast);
			collectMetadata(ast);
		} catch (error) {
			console.warn(`Failed to parse ${filePath}:`, error);
		}
	}
}

// The actual webpack loader function
export default function inlineFunctionsLoader(
	this: LoaderContext<InlineFunctionsOptions>,
	source: string
): void {
	const id = this.resourcePath;
	// console.log(`[${new Date().toISOString()}] 0 inlineFunctionsLoader - id: ${id}`);

	// console.log(`\n [${new Date().toISOString()}] 0 inlineFunctionsLoader - id: ${id}`);

	// console.log(`inlinableFunctions.size: ${inlinableFunctions.size}`);
	// for (const [key, call] of inlinableFunctions.entries()) {
	// 	console.log(
	// 		`inlinableFunctions - ${key} - call.name: ${call.name} - call.params: ${call.params.toString()}`
	// 	);
	// }

	// console.log(`\n inlinableFunctionCalls.size: ${inlinableFunctionCalls.size}`);
	// for (const [key, call] of inlinableFunctionCalls.entries()) {
	// 	console.log(
	// 		`inlinableFunctionCalls - ${key} - call.name: ${call.name} - call.params: ${call.params.toString()}`
	// 	);
	// }

	// console.log(`\n pureFunctions.size: ${pureFunctions.size}`);
	// console.log(`pureFunctions: `, pureFunctions);

	// console.log(`\n callsiteInlineCandidates.size: ${callsiteInlineCandidates.size}`);
	// console.log(`callsiteInlineCandidates: `, callsiteInlineCandidates);

	// Only transform JS/TS files
	// if (!/\.(js|ts|jsx|tsx)$/.test(id)) {
	// if (!/\.ts$/.test(id)) {
	// 	return source;
	// }

	// Get options passed via webpack config
	const options: InlineFunctionsOptions = (this.getOptions() || {}) as InlineFunctionsOptions;
	// console.log('options: ', options);

	// Lazy one-time initialization
	scanAndCollectMetadata(options);
	// scanAndCollectMetadata(options);

	// console.log('codeCache.size: ', codeCache.size);

	const hash = hashContent(source);
	if (codeCache.has(hash)) {
		console.log(
			`[${new Date().toISOString()}] - ${Math.random().toString(36).substring(2, 10)} - 1 inlineFunctionsLoader - id: ${id}\n`
		);
		this.callback(null, codeCache.get(hash)!);
		// return codeCache.get(hash)!;
		return;
	}

	try {
		const ast =
			astCache.get(hash) ??
			parse(source, {
				sourceType: 'module',
				plugins: ['typescript', 'jsx'],
				sourceFilename: id,
			});

		const transformedCode = inlineFunctions(ast);
		codeCache.set(hash, transformedCode);

		logStats(this);
		console.log(
			`[${new Date().toISOString()}] - ${Math.random().toString(36).substring(2, 10)} - 2 inlineFunctionsLoader - id: ${id}\n`
		);
		// return transformedCode;
		this.callback(null, transformedCode);
		return;
	} catch (error) {
		console.error(`Failed to transform ${id}:`, error);
		// return source; // Return original on failure
		this.callback(error as Error, source);
		return;
	}
}
