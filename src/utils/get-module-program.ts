import { NodePath } from '@babel/traverse';
import { type Program } from '@babel/types';

const cache = new Map<NodePath, Program | null>();

export function getModuleProgram(path: NodePath): Program | null | undefined {
	if (cache.has(path)) return cache.get(path);

	let parent = path.parentPath;
	let program: Program | null = null;

	while (parent) {
		if (parent.parentPath === null) {
			program = parent.node as Program;
		}
		parent = parent.parentPath!;
	}

	cache.set(path, program);

	return program;
}
