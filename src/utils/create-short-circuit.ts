import {
	assignmentExpression,
	type Expression,
	type ExpressionStatement,
	expressionStatement,
	identifier,
	logicalExpression,
	sequenceExpression,
	unaryExpression,
} from '@babel/types';

export function createShortCircuit(
	condition: Expression,
	expressions: Expression[],
	completedName?: string
): ExpressionStatement {
	const sequence = sequenceExpression(expressions);
	return expressionStatement(
		completedName
			? logicalExpression(
					'&&',
					logicalExpression(
						'&&',
						unaryExpression('!', identifier(completedName)),
						condition
					),
					sequence
				)
			: logicalExpression('&&', condition, sequence)
	);
}

export function createShortCircuitAssignment(
	expression: Expression,
	completedName: string,
	resultName: string
): ExpressionStatement {
	return expressionStatement(
		logicalExpression(
			'&&',
			unaryExpression('!', identifier(completedName)),
			assignmentExpression('=', identifier(resultName), expression || identifier('undefined'))
		)
	);
}
