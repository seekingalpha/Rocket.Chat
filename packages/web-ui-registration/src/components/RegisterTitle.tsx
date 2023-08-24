import { useSetting } from '@rocket.chat/ui-contexts';

export const RegisterTitle = () => {
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
