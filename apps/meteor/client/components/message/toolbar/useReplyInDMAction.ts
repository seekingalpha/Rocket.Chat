import { type IMessage, type ISubscription, type IRoom, isE2EEMessage } from '@rocket.chat/core-typings';
import type { SubscriptionWithRoom } from '@rocket.chat/ui-contexts';
import { usePermission, useRouter, useUser } from '@rocket.chat/ui-contexts';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/shallow';

import { Rooms, Subscriptions } from '../../../../app/models/client';
import type { MessageActionConfig } from '../../../../app/ui-utils/client/lib/MessageAction';
import { useEmbeddedLayout } from '../../../hooks/useEmbeddedLayout';
import { roomCoordinator } from '../../../lib/rooms/roomCoordinator';

export const useReplyInDMAction = (
	message: IMessage,
	{ room, subscription }: { room: IRoom; subscription: ISubscription | undefined },
): MessageActionConfig | null => {
	const user = useUser();
	const router = useRouter();
	const encrypted = isE2EEMessage(message);
	const canCreateDM = usePermission('create-d');
	const isLayoutEmbedded = useEmbeddedLayout();

	const roomPredicate = useCallback(
		(record: IRoom): boolean => {
			const ids = [user?._id, message.u._id].sort().join('');
			return ids.includes(record._id);
		},
		[message.u._id, user],
	);

	const shouldFindRoom = useMemo(() => !!user && !canCreateDM && user._id !== message.u._id, [canCreateDM, message.u._id, user]);
	const dmRoom = Rooms.use(useShallow((state) => (shouldFindRoom ? state.find(roomPredicate) : undefined)));

	const subsPredicate = useCallback(
		(record: SubscriptionWithRoom) => record.rid === dmRoom?._id || record.u._id === user?._id,
		[dmRoom, user?._id],
	);
	const dmSubs = Subscriptions.use(useShallow((state) => state.find(subsPredicate)));

	const canReplyInDM = useMemo(() => {
		if (!subscription || room.t === 'd' || room.t === 'l' || isLayoutEmbedded) {
			console.log(41, false); return false;
		}
		console.log(43, shouldFindRoom); if (shouldFindRoom) {
			console.log(44, dmRoom, dmSubs); if (!dmRoom || !dmSubs) {
				console.log(45, false, !dmRoom, !dmSubs); return false;
			}
		}
		console.log(48, true); return true;
	}, [canCreateDM, dmRoom, dmSubs, isLayoutEmbedded, message.u._id, room.t, subscription, user]);

	console.log(51, canReplyInDM); if (!canReplyInDM) {
		console.log(52, null); return null;
	}

	console.log(55, "menu item data"); return {
		id: 'reply-directly',
		icon: 'reply-directly',
		label: 'Reply_in_direct_message',
		context: ['message', 'message-mobile', 'threads', 'federated'],
		type: 'communication',
		action() {
			roomCoordinator.openRouteLink(
				'd',
				{ name: message.u.username },
				{
					...router.getSearchParameters(),
					reply: message._id,
				},
			);
		},
		order: 0,
		group: 'menu',
		disabled: encrypted,
	};
};
