// import { NodePath } from '@babel/traverse';
// import type { NodePath } from '@babel/traverse';
// import type { Function } from '@babel/types';

export const inlinedFunctionCount = new Map<string, number>();
export const transformedFunctions = new Map<string, { isPure: boolean; absoluteFilePath?: string }>();

function getInlinedFunctionCount(name: string): number {
	return inlinedFunctionCount.get(name) ?? 0;
}

function getAllInlinedFunctionCounts(): MapIterator<[string, number]> {
	return inlinedFunctionCount.entries();
}

function incrementInlinedFunctionCount(name: string): void {
	inlinedFunctionCount.set(name, (inlinedFunctionCount.get(name) ?? 0) + 1);
}

function setTransformedFunction(name: string, isPure: boolean, absoluteFilePath?: string): void {
	transformedFunctions.set(name, { isPure, absoluteFilePath });
}

function getAllTransformedFunctions(): Array<
	[string, { isPure: boolean; absoluteFilePath?: string }]
> {
	return Array.from(transformedFunctions);
}

function reset(): void {
	inlinedFunctionCount.clear();
	transformedFunctions.clear();
}

export const STATS: {
	getInlinedFunctionCount: typeof getInlinedFunctionCount;
	getAllInlinedFunctionCounts: typeof getAllInlinedFunctionCounts;
	incrementInlinedFunctionCount: typeof incrementInlinedFunctionCount;
	setTransformedFunction: typeof setTransformedFunction;
	getAllTransformedFunctions: typeof getAllTransformedFunctions;
	reset: typeof reset;
} = {
	getInlinedFunctionCount,
	getAllInlinedFunctionCounts,
	incrementInlinedFunctionCount,
	setTransformedFunction,
	getAllTransformedFunctions,
	reset,
};
