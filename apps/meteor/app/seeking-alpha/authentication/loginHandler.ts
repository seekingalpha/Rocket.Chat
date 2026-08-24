import { Logger } from '@rocket.chat/logger';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';

import {
	authenticateWithMainWebsite,
	getMainWebsiteAuthenticationUrl,
	MainWebsiteAuthenticationError,
} from './authenticateWithMainWebsite';

type PasswordLoginRequest = {
	user: string | { email?: string; username?: string };
	password: unknown;
};

const logger = new Logger('SeekingAlphaAuthentication');

const getPasswordLoginRequest = (options: Record<string, any>): PasswordLoginRequest | undefined => {
	if (!Object.hasOwn(options, 'password')) {
		return undefined;
	}

	if (typeof options.user === 'string') {
		return { user: options.user, password: options.password };
	}

	if (typeof options.user?.email === 'string' || typeof options.user?.username === 'string') {
		return { user: options.user, password: options.password };
	}

	return undefined;
};

const getEmail = ({ user }: PasswordLoginRequest): string => {
	if (typeof user === 'string') {
		return user;
	}

	return user.email ?? user.username ?? '';
};

const toLoginError = (error: unknown): Meteor.Error => {
	if (error instanceof MainWebsiteAuthenticationError) {
		switch (error.kind) {
			case 'rate-limited':
				return new Meteor.Error('too-many-requests', 'Too many login attempts');
			case 'service-unavailable':
				return new Meteor.Error('external-authentication-unavailable', 'Authentication service unavailable');
			case 'invalid-credentials':
				// Match Rocket.Chat's ambiguous login error and do not disclose whether the account exists.
				return new Meteor.Error(401, 'User not found');
		}
	}

	return new Meteor.Error('external-authentication-unavailable', 'Authentication service unavailable');
};

const { _runLoginHandlers } = Accounts;

Accounts._runLoginHandlers = async function (methodInvocation, options) {
	const loginRequest = getPasswordLoginRequest(options);

	if (!loginRequest) {
		return _runLoginHandlers.call(this, methodInvocation, options);
	}

	try {
		const authenticationUrl = getMainWebsiteAuthenticationUrl();
		if (!authenticationUrl) {
			return _runLoginHandlers.call(this, methodInvocation, options);
		}
		if (typeof loginRequest.password !== 'string') {
			return {
				type: 'password',
				error: new Meteor.Error('external-authentication-requires-plaintext', 'Password login must send plaintext credentials over HTTPS'),
			};
		}

		const resumeToken = await authenticateWithMainWebsite(authenticationUrl, getEmail(loginRequest), loginRequest.password);

		// Let Meteor's built-in resume handler validate the token, find the Rocket.Chat user,
		// and return the stamped token expected by Accounts._attemptLogin. Keep the outer
		// attempt typed as password so Rocket.Chat's normal password-login hooks still run.
		const result = await _runLoginHandlers.call(this, methodInvocation, { resume: resumeToken });
		return { ...result, type: 'password' };
	} catch (error) {
		if (!(error instanceof MainWebsiteAuthenticationError) || error.kind === 'service-unavailable') {
			logger.warn({ msg: 'External password authentication failed', err: error });
		}

		// Returning a login result (instead of throwing) keeps failed-login hooks and protections active.
		return {
			type: 'password',
			error: toLoginError(error),
		};
	}
};
