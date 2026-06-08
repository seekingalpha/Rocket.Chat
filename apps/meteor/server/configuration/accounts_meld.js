import { Logger } from '@rocket.chat/logger';
import { Users } from '@rocket.chat/models';
import { Accounts } from 'meteor/accounts-base';
import _ from 'underscore';

export async function configureAccounts() {
	const orig_updateOrCreateUserFromExternalService = Accounts.updateOrCreateUserFromExternalService;
	Accounts.updateOrCreateUserFromExternalService = async function (serviceName, serviceData = {}, ...args /* , options*/) {
		const services = ['facebook', 'github', 'gitlab', 'google', 'meteor-developer', 'linkedin', 'twitter', 'apple'];

		if (services.includes(serviceName) === false && serviceData._OAuthCustom !== true) {
			return orig_updateOrCreateUserFromExternalService.apply(this, [serviceName, serviceData, ...args]);
		}

		if (serviceName === 'meteor-developer') {
			if (Array.isArray(serviceData.emails)) {
				const primaryEmail = serviceData.emails.sort((a) => a.primary !== true).filter((item) => item.verified === true)[0];
				serviceData.email = primaryEmail && primaryEmail.address;
			}
		}

		if (serviceName === 'linkedin') {
			serviceData.email = serviceData.emailAddress;
		}

		if (serviceData.email) {
			const user = await Users.findOneByEmailAddress(serviceData.email);
			if (user != null && user.services?.[serviceName]?.id !== serviceData.id) {
				const LOG = new Logger('SeekingAlpha_OAuth_Meld').logger.child({
					email: serviceData.email,
					serviceName,
					serviceData,
					user,
				});

				LOG.warn(
					{ oauth_user_id_OLD: user.services?.[serviceName]?.id, oauth_user_id_NEW: serviceData.id },
					"OAuth User ID has changed!",
				);

				const findQuery = {
					address: serviceData.email,
					verified: true,
				};

				if (user.services?.password && !_.findWhere(user.emails, findQuery)) {
					LOG.error("RC wants to require password change!");
					// I am leaving upstream’s call to this function in place so that, by clearing the password,
					// we won’t call this code repeatedly.  Nonetheless, disable the actual requirePasswordChange.
					await Users.resetPasswordAndSetRequirePasswordChange(
						user._id,
						false, // Do NOT require a password change!
						// Since requirePasswordChange (above) is false,
						// the following requirePasswordChangeReason should never actually get shown.
						// We are adding it:
						// 1) in case it *does* get shown for some reason, we need a sensible value
						// 2) to record the timestamp of it being added
						`Contact Customer Support to have an engineer unlock your account (${new Date().toISOString()})`,
					);
				}

				await Users.setServiceId(user._id, serviceName, serviceData.id);
				// Don’t mess with the `emails.verified` flag.  Let SAPI manage it.
				// await Users.setEmailVerified(user._id, serviceData.email);
			}
		}

		return orig_updateOrCreateUserFromExternalService.apply(this, [serviceName, serviceData, ...args]);
	};
}
