import { act, renderHook } from '@testing-library/react';

import { useIgnoredMessage } from './useIgnoredMessage';

it('follows the authoritative ignored state while preserving a temporary reveal', () => {
	const { result, rerender } = renderHook(({ isIgnored }) => useIgnoredMessage(isIgnored), {
		initialProps: { isIgnored: false },
	});

	expect(result.current[0]).toBe(false);

	rerender({ isIgnored: true });
	expect(result.current[0]).toBe(true);

	act(() => result.current[1]());
	expect(result.current[0]).toBe(false);

	rerender({ isIgnored: false });
	rerender({ isIgnored: true });
	expect(result.current[0]).toBe(true);
});
