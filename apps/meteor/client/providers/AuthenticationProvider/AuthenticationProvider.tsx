import type { LoginServiceConfiguration } from '@rocket.chat/core-typings';
import { capitalize } from '@rocket.chat/string-helpers';
import { AuthenticationContext, useSetting } from '@rocket.chat/ui-contexts';
import { Meteor } from 'meteor/meteor';
import type { ContextType, ReactElement, ReactNode } from 'react';
import React, { useMemo } from 'react';

import { loginServices } from '../../lib/loginServices';
import { useLDAPAndCrowdCollisionWarning } from './hooks/useLDAPAndCrowdCollisionWarning';

export type LoginMethods = keyof typeof Meteor extends infer T ? (T extends `loginWith${string}` ? T : never) : never;

type AuthenticationProviderProps = {
	children: ReactNode;
};

const AuthenticationProvider = ({ children }: AuthenticationProviderProps): ReactElement => {
	const isLdapEnabled = useSetting<boolean>('LDAP_Enable');
	const isCrowdEnabled = useSetting<boolean>('CROWD_Enable');

	const loginMethod: LoginMethods = (isLdapEnabled && 'loginWithLDAP') || (isCrowdEnabled && 'loginWithCrowd') || 'loginWithPassword';

	useLDAPAndCrowdCollisionWarning();

	const contextValue = useMemo(
		(): ContextType<typeof AuthenticationContext> => ({
			loginWithToken: (token: string): Promise<void> =>
				new Promise((resolve, reject) =>
					Meteor.loginWithToken(token, (err) => {
						if (err) {
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

			queryLoginServices: {
				getCurrentValue: () => loginServices.getLoginServiceButtons(),
				subscribe: (onStoreChange: () => void) => loginServices.on('changed', onStoreChange),
			},
		}),
		[loginMethod],
	);

	return <AuthenticationContext.Provider children={children} value={contextValue} />;
};

export default AuthenticationProvider;
