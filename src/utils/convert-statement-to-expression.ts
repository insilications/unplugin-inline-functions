import {
	assignmentExpression,
	conditionalExpression,
	type Expression,
	identifier,
	isBlockStatement,
	isExpressionStatement,
	isIdentifier,
	isIfStatement,
	isLVal,
	isReturnStatement,
	isVariableDeclaration,
	numericLiteral,
	sequenceExpression,
	type Statement,
	type VoidPattern,
	type LVal,
	unaryExpression,
} from '@babel/types';

export function convertStatementToExpression(
	statement: Statement,
	resultName: string,
	suffix: string,
	localVars: Set<string>
): Expression {
	const rest = [resultName, suffix, localVars] as [string, string, Set<string>];

	// If it's already an ExpressionStatement, return its expression
	if (isExpressionStatement(statement)) {
		return statement.expression;
	}

	// For blocks, convert to sequence expression
	if (isBlockStatement(statement)) {
		return sequenceExpression(
			statement.body.map((stmt) => convertStatementToExpression(stmt, ...rest))
		);
	}

	// For if statements, convert to conditional expression
	if (isIfStatement(statement)) {
		return conditionalExpression(
			statement.test,
			convertStatementToExpression(statement.consequent, ...rest),
			statement.alternate
				? convertStatementToExpression(statement.alternate, ...rest)
				: identifier('undefined')
		);
	}

	if (isReturnStatement(statement)) {
		let argument = statement.argument;

		if (isIdentifier(argument) && localVars.has(argument.name)) {
			argument = identifier(argument.name + suffix);
		}

		return sequenceExpression([
			assignmentExpression('=', identifier(resultName), argument || identifier('undefined')),
		]);
	}

	if (isVariableDeclaration(statement)) {
		return sequenceExpression(
			statement.declarations.map((declaration) => {
				// Babel allows discard bindings in declarators, so `declaration.id` can be a
				// `VoidPattern` even though `assignmentExpression` only accepts real assignment
				// targets. Storing the node in a local constant lets the type guard narrow the
				// exact value we pass to the builder.
				const declaratorId: LVal | VoidPattern = declaration.id;
				const init: Expression = declaration.init || identifier('undefined');

				// Preserve the inliner's local rename convention before falling back to the
				// generic LVal branch below.
				if (isIdentifier(declaratorId) && localVars.has(declaratorId.name)) {
					return assignmentExpression('=', identifier(declaratorId.name + suffix), init);
				}

				// `isLVal` excludes `VoidPattern`, so inside this branch the declarator is a
				// valid assignment target and can be reused on the left-hand side safely.
				if (isLVal(declaratorId)) {
					return assignmentExpression('=', declaratorId, init);
				}

				// Discard bindings still evaluate their initializer; they just do not bind the
				// result to a name. Returning the initializer preserves side effects and
				// evaluation order inside the surrounding sequence expression without creating
				// an invalid synthetic assignment target.
				return init;
			})
		);
	}

	// Default case - wrap in void operator if we can't convert
	return unaryExpression('void', numericLiteral(0));
}
