import type { IThreadMessage } from '@rocket.chat/core-typings';
import { render, screen } from '@testing-library/react';

import ThreadMessage from './ThreadMessage';

const message = {
	ts: new Date('2021-10-27T00:00:00.000Z'),
	u: {
		_id: 'userId',
		name: 'userName',
		username: 'userName',
	},
	msg: 'thread message body',
	md: [
		{
			type: 'PARAGRAPH',
			value: [
				{
					type: 'PLAIN_TEXT',
					value: 'thread message body',
				},
			],
		},
	],
	rid: 'roomId',
	tmid: 'threadId',
	_id: 'messageId',
	_updatedAt: new Date('2021-10-27T00:00:00.000Z'),
	urls: [],
} as IThreadMessage;

jest.mock('@rocket.chat/ui-contexts', () => ({
	useTranslation: () => (key: string) => key,
	useUserId: () => 'currentUserId',
	useUserCard: () => ({ openUserCard: jest.fn(), triggerProps: {} }),
}));
jest.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../../views/room/MessageList/contexts/MessageHighlightContext', () => ({
	useIsMessageHighlight: () => false,
}));
jest.mock('../../../views/room/MessageList/hooks/useJumpToMessage', () => ({
	useJumpToMessage: () => undefined,
}));
jest.mock('../MessageHeader', () => () => null);
jest.mock('../MessageToolbarHolder', () => () => null);
jest.mock('../StatusIndicators', () => () => null);
jest.mock('./thread/ThreadMessageContent', () => ({
	__esModule: true,
	default: ({ message: threadMessage }: { message: IThreadMessage }) => <span>{threadMessage.msg}</span>,
}));

it('reacts to authoritative ignored-user changes', () => {
	const renderMessage = (ignoredUser: boolean) => (
		<ThreadMessage message={message} sequential={false} unread={false} ignoredUser={ignoredUser} showUserAvatar={false} />
	);

	const { rerender } = render(renderMessage(false));

	expect(screen.getByText('thread message body')).not.toBeNull();
	expect(screen.queryByRole('button', { name: 'Message_Ignored' })).toBeNull();

	rerender(renderMessage(true));

	expect(screen.queryByText('thread message body')).toBeNull();
	expect(screen.getByRole('button', { name: 'Message_Ignored' })).not.toBeNull();
});
