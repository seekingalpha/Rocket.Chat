import { useSetting } from '@rocket.chat/ui-contexts';
import type { ReactElement } from 'react';

export const RegisterTitle = (): ReactElement | null => {
	const hideTitle = useSetting('Layout_Login_Hide_Title', false);

	if (hideTitle) {
		return null;
	}

	return (
		<span id='welcomeTitle'>
			Seeking Alpha
			<br />
			Investing Groups
		</span>
	);
};
