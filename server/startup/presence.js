import { Meteor } from 'meteor/meteor';
import { InstanceStatus } from 'meteor/konecty:multiple-instances-status';
import { UserPresence, UserPresenceMonitor } from 'meteor/konecty:user-presence';


Meteor.startup(function() {
	const instance = {
		host: 'localhost',
		port: String(process.env.PORT).trim(),
	};

	if (process.env.INSTANCE_IP) {
		instance.host = String(process.env.INSTANCE_IP).trim();
	}

	InstanceStatus.registerInstance('rocket.chat', instance);

	UserPresence.start();

	if (process.env.USER_PRESENCE_MONITOR) {
		return UserPresenceMonitor.start();
	}
});
