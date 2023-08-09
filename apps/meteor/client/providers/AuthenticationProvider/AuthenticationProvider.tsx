import type { LoginServiceConfiguration } from '@rocket.chat/core-typings';
import { capitalize } from '@rocket.chat/string-helpers';
import { AuthenticationContext, useSetting } from '@rocket.chat/ui-contexts';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';
import type { ContextType, ReactElement, ReactNode } from 'react';
import { useMemo } from 'react';

import { useLDAPAndCrowdCollisionWarning } from './hooks/useLDAPAndCrowdCollisionWarning';
import { useReactiveValue } from '../../hooks/useReactiveValue';
import { loginServices } from '../../lib/loginServices';

export type LoginMethods = keyof typeof Meteor extends infer T ? (T extends `loginWith${string}` ? T : never) : never;

type AuthenticationProviderProps = {
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

const getLoggingIn = () => Accounts.loggingIn();

const AuthenticationProvider = ({ children }: AuthenticationProviderProps): ReactElement => {
	const isLdapEnabled = useSetting('LDAP_Enable', false);
	const isCrowdEnabled = useSetting('CROWD_Enable', false);

	const loginMethod: LoginMethods = (isLdapEnabled && 'loginWithLDAP') || (isCrowdEnabled && 'loginWithCrowd') || 'loginWithPassword';

	useLDAPAndCrowdCollisionWarning();

	const isLoggingIn = useReactiveValue(getLoggingIn);

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
					.then((response) => response.json())
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
					});
				}),
			/* eslint-enable prettier/prettier */
			loginWithService: <T extends LoginServiceConfiguration>(serviceConfig: T): (() => Promise<true>) => {
				const loginMethods: Record<string, string | undefined> = {
					'meteor-developer': 'MeteorDeveloperAccount',
				};

				const { service: serviceName } = serviceConfig;
				const clientConfig = ('clientConfig' in serviceConfig && serviceConfig.clientConfig) || {};

				const loginWithService = `loginWith${loginMethods[serviceName] || capitalize(String(serviceName || ''))}`;

				const method: (config: unknown, cb: (error: any) => void) => Promise<true> = (Meteor as any)[loginWithService] as any;

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
			unstoreLoginToken: (callback) => {
				const { _unstoreLoginToken } = Accounts;
				Accounts._unstoreLoginToken = function (...args) {
					callback();
					_unstoreLoginToken.apply(Accounts, args);
				};
				return () => {
					Accounts._unstoreLoginToken = _unstoreLoginToken;
				};
			},
			queryLoginServices: {
				getCurrentValue: () => loginServices.getLoginServiceButtons(),
				subscribe: (onStoreChange: () => void) => loginServices.on('changed', onStoreChange),
			},
		}),
		[isLoggingIn, loginMethod],
	);

	return <AuthenticationContext.Provider children={children} value={contextValue} />;
};

export default AuthenticationProvider;
