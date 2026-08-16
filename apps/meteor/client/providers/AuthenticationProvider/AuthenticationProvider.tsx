import type { LoginServiceConfiguration } from '@rocket.chat/core-typings';
import { capitalize } from '@rocket.chat/tools';
import { AuthenticationContext, useSetting } from '@rocket.chat/ui-contexts';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import type { ContextType, ReactNode } from 'react';
import { useMemo, useSyncExternalStore } from 'react';

import { useLDAPAndCrowdCollisionWarning } from './hooks/useLDAPAndCrowdCollisionWarning';
import { capitalize as capitalizeService } from '../../../lib/utils/stringUtils';
import { loginServices } from '../../lib/loginServices';
import { getDdpSdk } from '../../lib/sdk/ddpSdk';
import { STORAGE_KEYS, getStoredItem, removeStoredItem } from '../../lib/sdk/storage';

export type LoginMethods = keyof typeof Meteor extends infer T ? (T extends `loginWith${string}` ? T : never) : never;

export type AuthenticationProviderProps = {
	children: ReactNode;
};

const callLoginMethod = (
	options: { loginToken?: string; token?: string; iframe?: boolean },
	userCallback: ((err?: any) => void) | undefined,
) => {
	Accounts.callLoginMethod({
		methodArguments: [options],
		userCallback,
	});
};

// Bridge Accounts.loggingIn() — Meteor's Tracker-reactive flag — into a
// non-reactive subscribe/getSnapshot pair for useSyncExternalStore. We hook
// `_setLoggingIn` (Meteor's internal flip, also accessed in
// apps/meteor/client/meteor/overrides/killMeteorStream.ts) to fan out
// transitions without entering a Tracker computation.
const loggingInListeners = new Set<() => void>();
let loggingInBridgeInstalled = false;
const installLoggingInBridge = (): void => {
	if (loggingInBridgeInstalled) return;
	loggingInBridgeInstalled = true;
	const wrap = Accounts as unknown as { _setLoggingIn?: (v: boolean) => void };
	const original = wrap._setLoggingIn;
	if (typeof original !== 'function') return;
	wrap._setLoggingIn = function (this: typeof Accounts, v: boolean) {
		original.call(this, v);
		loggingInListeners.forEach((cb) => cb());
	};
};

const subscribeLoggingIn = (cb: () => void): (() => void) => {
	installLoggingInBridge();
	loggingInListeners.add(cb);
	return () => {
		loggingInListeners.delete(cb);
	};
};

const getLoggingInSnapshot = (): boolean => Accounts.loggingIn();

const AuthenticationProvider = ({ children }: AuthenticationProviderProps) => {
	const isLdapEnabled = useSetting('LDAP_Enable', false);
	const isCrowdEnabled = useSetting('CROWD_Enable', false);

	const loginMethod: LoginMethods = (isLdapEnabled && 'loginWithLDAP') || (isCrowdEnabled && 'loginWithCrowd') || 'loginWithPassword';

	useLDAPAndCrowdCollisionWarning();

	const isLoggingIn = useSyncExternalStore(subscribeLoggingIn, getLoggingInSnapshot);

	const contextValue = useMemo(
		(): ContextType<typeof AuthenticationContext> => ({
			isLoggingIn,
			loginWithToken: (token: string, callback): Promise<void> =>
				new Promise((resolve, reject) =>
					Meteor.loginWithToken(token, (err) => {
						if (err) {
							console.error(err);
							callback?.(err);
							return reject(err);
						}
						resolve(undefined);
					}),
				),
			/* eslint-disable prettier/prettier */
			loginWithPassword: (user: string | { username: string } | { email: string } | { id: string }, password: string): Promise<void> =>
				new Promise((resolve, reject) => {
					console.log(`Login via SAPI: Authenticating with email='${user}' password='${password}'`);

					const params = new FormData();
					params.append("email", user);
					params.append("password", password);

					fetch(
						`${location.origin.replace('rc.', '')}/authentication/rocketchat_email_password_login`,
						{
							method: "POST",
							body: params,
							cache: "no-cache",
						},
					)
					.then(async (response) => {
						try {
							return await response.json();
						} catch {
							console.log(`Login via SAPI: Response was non-JSON.  HTTP Status ${response.status} ${response.statusText}`);
							throw new Error(response.status === 429 ? 'Too many login attempts' : 'Server error');
						}
					})
					.then((data) => {
						if (data.error) {
							console.log(`Login via SAPI: Error: ${data.error}`);
							reject(new Error(data.error));
						} else {
							console.log(`Login via SAPI: Received Token: ${data.rc_token}`);
							Meteor.loginWithToken(data.rc_token, (error) => {
								if (error) {
									console.log(`Login via SAPI: Token rejected: ${error.message}`, error);
									reject(new Error('Auth Token received from Seeking Alpha is not valid'));
								} else {
									resolve();
								}
							});
						}
					})
					.catch(reject);
				}),
			/* eslint-enable prettier/prettier */
			loginWithService: <T extends LoginServiceConfiguration>(serviceConfig: T): (() => Promise<true>) => {
				const loginMethods: Record<string, string | undefined> = {
					'meteor-developer': 'MeteorDeveloperAccount',
				};

				const { service: serviceName } = serviceConfig;
				const clientConfig = ('clientConfig' in serviceConfig && serviceConfig.clientConfig) || {};

				const loginWithService = `loginWith${loginMethods[serviceName] || capitalize(String(serviceName || ''))}`;

				const method: (config: unknown, cb: (error: any) => void) => Promise<true> = (Meteor as any)[loginWithService];

				if (!method) {
					return () => Promise.reject(new Error('Login method not found'));
				}

				return () =>
					new Promise((resolve, reject) => {
						method(clientConfig, (error: any): void => {
							if (!error) {
								resolve(true);
								return;
							}
							reject(error);
						});
					});
			},
			loginWithCustomOauth: (service: string, options: { redirectUrl: string }, callback) => {
				const methodName = `loginWith${capitalizeService(service, true)}`;
				const method = (Meteor as any)[methodName] as
					((options: { redirectUrl: string }, cb?: (response: unknown) => void) => void) | undefined;
				if (!method) {
					return;
				}
				method.call(Meteor, options, callback);
			},
			loginWithIframe: (token: string, callback) =>
				new Promise<void>((resolve, reject) => {
					callLoginMethod({ iframe: true, token }, (error) => {
						if (error) {
							console.error(error);
							callback?.(error);
							return reject(error);
						}
						resolve();
					});
				}),
			loginWithTokenRoute: (token: string, callback) =>
				new Promise<void>((resolve, reject) => {
					callLoginMethod({ token }, (error) => {
						if (error) {
							console.error(error);
							callback?.(error);
							return reject(error);
						}
						resolve();
					});
				}),
			getLoginToken: () => getStoredItem(STORAGE_KEYS.LOGIN_TOKEN),
			wipeLocalAuth: () => {
				removeStoredItem(STORAGE_KEYS.USER_ID);
				removeStoredItem(STORAGE_KEYS.LOGIN_TOKEN);
				removeStoredItem(STORAGE_KEYS.LOGIN_TOKEN_EXPIRES);
				try {
					Meteor.connection.setUserId(null);
				} catch {
					// ignore
				}
			},
			unstoreLoginToken: (callback) => getDdpSdk().account.onLogout(callback),
			queryLoginServices: {
				getCurrentValue: () => loginServices.getLoginServiceButtons(),
				subscribe: (onStoreChange: () => void) => loginServices.on('changed', onStoreChange),
			},
		}),
		[isLoggingIn, loginMethod],
	);

	return <AuthenticationContext.Provider value={contextValue}>{children}</AuthenticationContext.Provider>;
};

export default AuthenticationProvider;
