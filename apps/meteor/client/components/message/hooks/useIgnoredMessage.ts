import { useCallback, useEffect, useState } from 'react';

export const useIgnoredMessage = (isIgnored: boolean): [isHidden: boolean, reveal: () => void] => {
	const [manuallyRevealed, setManuallyRevealed] = useState(false);

	useEffect(() => {
		setManuallyRevealed(false);
	}, [isIgnored]);

	const reveal = useCallback(() => setManuallyRevealed(true), []);

	return [isIgnored && !manuallyRevealed, reveal];
};
