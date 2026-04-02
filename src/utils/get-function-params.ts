import {
	type ArrowFunctionExpression,
	type FunctionDeclaration,
	type FunctionExpression,
	isIdentifier,
} from '@babel/types';

export function getFunctionParams(
	node: FunctionDeclaration | ArrowFunctionExpression | FunctionExpression
): string[] {
	const params = node.params
		.map((param) => (isIdentifier(param) ? param.name : null))
		.filter(Boolean) as string[];
	return params;
}
