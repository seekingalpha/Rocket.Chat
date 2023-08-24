import { useSetting } from '@rocket.chat/ui-contexts';
import type { ReactElement } from 'react';

export const RegisterTitle = (): ReactElement | null => {
	const hideTitle = useSetting<boolean>('Layout_Login_Hide_Title');

	if (hideTitle) {
		return null;
	}

	return (
		<>
			Seeking Alpha
			<br />
			Investing Groups
		</>
	);
};
