import type { IMessage } from '@rocket.chat/core-typings';
import { Meteor } from 'meteor/meteor';

import { sdk } from '../../app/utils/client/lib/SDKClient';
import { onLoggedIn } from '../lib/loggedIn';
import { getUserId } from '../lib/user';
import { Messages } from '../stores';

Meteor.startup(() => {
	onLoggedIn(() => {
		// Only event I found triggers this is from ephemeral messages
		// Other types of messages come from another stream
		return sdk.stream('notify-user', [`${getUserId()}/message`], (msg: IMessage) => {
			msg.u = msg.u || { username: 'rocket.cat' };
			msg.private = true;

			return Messages.state.store(msg);
		});
	});
});
