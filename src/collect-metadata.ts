import { type ParseResult } from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
import {
	type ArrowFunctionExpression,
	type ExpressionStatement,
	type File,
	type FunctionDeclaration,
	type FunctionExpression,
	isCallExpression,
	isIdentifier,
	type VariableDeclarator,
} from '@babel/types';
import { collectDependencyChain, collectLocalDependencies } from './utils/collect-local-dependencies';
import { hasInlineDecorator, hasPureDecorator } from './utils/decorator-utils';
import { getFunctionParams } from './utils/get-function-params';
import { getBabelDefaultExport } from './utils/babel-exports';

const traverse = getBabelDefaultExport(_traverse);

export type InlinableFunction = {
	name: string;
	params: string[];
	func: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;
	path: NodePath<
		FunctionDeclaration | ArrowFunctionExpression | FunctionExpression | VariableDeclarator
	>;
};

export const allFunctions: Map<string, InlinableFunction> = new Map<string, InlinableFunction>();
export const inlinableFunctions: Map<string, InlinableFunction> = new Map<
	string,
	InlinableFunction
>();
export const inlinableFunctionCalls: Map<string, InlinableFunction> = new Map<
	string,
	InlinableFunction
>();
export const pureFunctions: Set<string> = new Set<string>();

// Names of functions that have at least one call site annotated with /* @inline */
// We resolve these to concrete function declarations after all files have been scanned,
// so that file order does not matter.
export const callsiteInlineCandidates: Set<string> = new Set<string>();

export function collectMetadata(ast: ParseResult<File>): void {
	// Look for any function that has a @inline or @pure decorator.
	traverse(ast, {
		// Collect function delcaratoins.
		FunctionDeclaration(path) {
			const node = path.node;
			const hasInline = hasInlineDecorator(node) || hasInlineDecorator(path.parent);
			const hasPure = hasPureDecorator(node) || hasPureDecorator(path.parent);

			// Ignore anonymous functions.
			if (!node.id) return;

			// If the function is not inlineable, save it in case there is a call to it.
			if (!hasInline) {
				allFunctions.set(node.id.name, {
					name: node.id.name,
					func: node,
					params: getFunctionParams(node),
					path,
				});
			} else {
				collectLocalDependencies(path);

				inlinableFunctions.set(node.id.name, {
					name: node.id.name,
					func: node,
					params: getFunctionParams(node),
					path,
				});
			}

			// Collect pure functions.
			if (hasPure) pureFunctions.add(node.id.name);
		},
		// Collect arrow functions and function expressions (assigned to a variable).
		VariableDeclarator(path) {
			const node = path.node;
			const init = node.init;
			if (
				init &&
				(init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
			) {
				const id = node.id;

				// Ignore anonymous functions.
				if (!isIdentifier(id)) return;

				// If the function is not inlineable, save it in case there is a call to it.
				if (!hasInlineDecorator(init)) {
					allFunctions.set(id.name, {
						name: id.name,
						func: init,
						params: getFunctionParams(init),
						path,
					});
				} else {
					collectLocalDependencies(path);

					inlinableFunctions.set(id.name, {
						name: id.name,
						func: init,
						params: getFunctionParams(init),
						path,
					});
				}

				// Collect pure functions.
				if (hasPureDecorator(init)) pureFunctions.add(id.name);
			}
		},
		CallExpression(path) {
			const node = path.node;
			const callee = node.callee;

			// Check if parent is an expression statement.
			if (path.parent.type === 'ExpressionStatement') {
				const parent = path.parent as unknown as ExpressionStatement;
				if (
					!isCallExpression(parent.expression) ||
					!isIdentifier(parent.expression.callee) ||
					!hasInlineDecorator(parent)
				)
					return;

				const name = parent.expression.callee.name;
				callsiteInlineCandidates.add(name);
			} else {
				if (!isIdentifier(callee) || !hasInlineDecorator(node)) return;

				const name = callee.name;
				callsiteInlineCandidates.add(name);
			}
		},
	});

	// Resolve any call-site-only inline candidates to concrete function declarations.
	// This is done after traversing each file so that declaration and usage order
	// across files does not matter.
	for (const name of callsiteInlineCandidates) {
		if (inlinableFunctionCalls.has(name)) continue;
		const func = allFunctions.get(name);
		if (func) {
			inlinableFunctionCalls.set(name, func);
		}
	}

	for (const func of inlinableFunctions.values()) {
		collectDependencyChain(func.name, func.path);
	}
}

export function resetMetadata(): void {
	allFunctions.clear();

	inlinableFunctions.clear();
	inlinableFunctionCalls.clear();
	pureFunctions.clear();
	callsiteInlineCandidates.clear();
}
