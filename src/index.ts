import { parse } from '@babel/parser';
import { createHash } from 'node:crypto';
import fg from 'fast-glob';
import fs from 'node:fs';
// import path from 'node:path';
import util from 'node:util';
import { collectMetadata, resetMetadata } from './collect-metadata';
import { inlineFunctions } from './inline-functions';
// import { STATS } from './stats';
import { discoverFilesViaReferences } from './utils/discover-files';
import { findProjectRoot } from './utils/find-project-root';
import { type LoaderDefinitionFunction, type LoaderContext } from 'webpack';
import {
	inlinableFunctions,
	inlinableFunctionCalls,
	pureFunctions,
	callsiteInlineCandidates,
} from './collect-metadata';

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

function hashContent(content: string): string {
	return createHash('md5').update(content).digest('hex');
}

function scanAndCollectMetadata(options: InlineFunctionsOptions) {
	if (initialized) return;

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

	console.log('scanAndCollectMetadata - options: ', options);

	// STATS.reset();
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
const inlineFunctionsLoader: LoaderDefinitionFunction = function (
	this: LoaderContext<InlineFunctionsOptions>,
	source: string
) {
	const id = this.resourcePath;
	console.log(`id: ${id}`);

	console.log(`inlinableFunctions.size: ${inlinableFunctions.size}`);
	for (const [key, call] of inlinableFunctions.entries()) {
		console.log(
			`inlinableFunctions - ${key} - call.name: ${call.name} - call.params: ${call.params.toString()}`
		);
	}

	console.log(`\n inlinableFunctionCalls.size: ${inlinableFunctionCalls.size}`);
	for (const [key, call] of inlinableFunctionCalls.entries()) {
		console.log(
			`inlinableFunctionCalls - ${key} - call.name: ${call.name} - call.params: ${call.params.toString()}`
		);
	}

	console.log(`\n pureFunctions.size: ${pureFunctions.size}`);
	console.log(`pureFunctions: `, pureFunctions);

	console.log(`\n callsiteInlineCandidates.size: ${callsiteInlineCandidates.size}`);
	console.log(`callsiteInlineCandidates: `, callsiteInlineCandidates);

	// Only transform JS/TS files
	// if (!/\.(js|ts|jsx|tsx)$/.test(id)) {
	if (!/\.ts$/.test(id)) {
		return source;
	}

	// Get options passed via webpack config
	const options: InlineFunctionsOptions = (this.getOptions() || {}) as InlineFunctionsOptions;
	console.log('options: ', options);

	// Lazy one-time initialization
	scanAndCollectMetadata(options);

	console.log('codeCache.size: ', codeCache.size);

	const hash = hashContent(source);
	if (codeCache.has(hash)) {
		return codeCache.get(hash)!;
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
		return transformedCode;
	} catch (error) {
		console.error(`Failed to transform ${id}:`, error);
		return source; // Return original on failure
	}
};

export default inlineFunctionsLoader;
