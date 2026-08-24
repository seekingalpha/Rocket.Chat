import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';

import { overrideLoginMethod, type LoginCallback } from '../../lib/2fa/overrideLoginMethod';

declare module 'meteor/meteor' {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Meteor {
		function loginWithPassword(
			userDescriptor: { username: string } | { email: string } | { id: string } | string,
			password: string,
			callback?: LoginCallback,
		): void;
	}
}

const normalizeUserDescriptor = (userDescriptor: { username: string } | { email: string } | { id: string } | string) => {
	if (typeof userDescriptor !== 'string') {
		return userDescriptor;
	}

	return userDescriptor.includes('@') ? { email: userDescriptor } : { username: userDescriptor };
};

const callPasswordLoginMethod = (loginRequest: Record<string, unknown>, callback?: LoginCallback) => {
	Accounts.callLoginMethod({
		methodArguments: [loginRequest],
		userCallback(error?: Parameters<LoginCallback>[0]) {
			if (!error) {
				callback?.(undefined);
				return;
			}

			if (callback) {
				callback(error);
				return;
			}

			throw error;
		},
	});
};

const loginWithPassword = (
	userDescriptor: { username: string } | { email: string } | { id: string } | string,
	password: string,
	callback?: LoginCallback,
) => {
	// Deliberately pass plaintext to the Rocket.Chat server. In production the
	// outbound DDP method is carried by Rocket.Chat's HTTPS method.callAnon bridge.
	// The server forwards it to the main website and never checks the local password.
	callPasswordLoginMethod(
		{
			user: normalizeUserDescriptor(userDescriptor),
			password,
		},
		callback,
	);
};

const loginWithPasswordAndTOTP = (
	userDescriptor: { username: string } | { email: string } | { id: string } | string,
	password: string,
	code: string,
	callback?: LoginCallback,
) => {
	callPasswordLoginMethod(
		{
			totp: {
				login: {
					user: normalizeUserDescriptor(userDescriptor),
					password: Accounts._hashPassword(password),
				},
				code,
			},
		},
		callback,
	);
};

Meteor.loginWithPassword = (
	userDescriptor: { username: string } | { email: string } | { id: string } | string,
	password: string,
	callback?: LoginCallback,
) => {
	overrideLoginMethod(loginWithPassword, [userDescriptor, password], callback, loginWithPasswordAndTOTP);
};
