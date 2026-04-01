// import { NodePath } from '@babel/traverse';
// import type { NodePath } from '@babel/traverse';
// import type { Function } from '@babel/types';

const inlinedFunctionCount = new Map<string, number>();
const transformedFunctions = new Map<string, { isPure: boolean; absoluteFilePath?: string }>();

function getInlinedFunctionCount(name: string) {
	return inlinedFunctionCount.get(name) ?? 0;
}

function getAllInlinedFunctionCounts() {
	return inlinedFunctionCount.entries();
}

function incrementInlinedFunctionCount(name: string) {
	inlinedFunctionCount.set(name, (inlinedFunctionCount.get(name) ?? 0) + 1);
}

function setTransformedFunction(name: string, isPure: boolean, absoluteFilePath?: string) {
	transformedFunctions.set(name, { isPure, absoluteFilePath });
}

function getAllTransformedFunctions() {
	return Array.from(transformedFunctions);
}

function reset() {
	inlinedFunctionCount.clear();
	transformedFunctions.clear();
}

export const STATS = {
	getInlinedFunctionCount,
	getAllInlinedFunctionCounts,
	incrementInlinedFunctionCount,
	setTransformedFunction,
	getAllTransformedFunctions,
	reset,
};
