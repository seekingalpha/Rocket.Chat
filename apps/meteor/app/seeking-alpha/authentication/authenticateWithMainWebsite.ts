import { serverFetch } from '@rocket.chat/server-fetch';

const AUTHENTICATION_PATH = '/authentication/rocketchat_email_password_login';
const AUTHENTICATION_TIMEOUT = 15_000;

type MainWebsiteAuthenticationResponse = {
	error?: unknown;
	rc_token?: unknown;
};

export type MainWebsiteLoginIdentifier = { email: string } | { username: string };

export type MainWebsiteAuthenticationErrorKind = 'invalid-credentials' | 'rate-limited' | 'service-unavailable';

export class MainWebsiteAuthenticationError extends Error {
	constructor(
		message: string,
		public readonly kind: MainWebsiteAuthenticationErrorKind,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

const assertSecureAuthenticationUrl = (url: URL): URL => {
	if (url.protocol !== 'https:') {
		throw new Error('The main website authentication URL must use HTTPS');
	}

	return url;
};

export const getMainWebsiteAuthenticationUrl = ({
	rootUrl = process.env.ROOT_URL,
	overrideUrl = process.env.SEEKING_ALPHA_AUTHENTICATION_URL,
}: {
	rootUrl?: string;
	overrideUrl?: string;
} = {}): string | undefined => {
	if (overrideUrl) {
		return assertSecureAuthenticationUrl(new URL(overrideUrl)).toString();
	}

	if (!rootUrl) {
		return undefined;
	}

	const url = new URL(rootUrl);
	if (!url.hostname.startsWith('rc.')) {
		return undefined;
	}

	url.hostname = url.hostname.slice('rc.'.length);
	url.pathname = AUTHENTICATION_PATH;
	url.search = '';
	url.hash = '';

	return assertSecureAuthenticationUrl(url).toString();
};

export const authenticateWithMainWebsite = async (
	url: string,
	identifier: MainWebsiteLoginIdentifier,
	password: string,
	request: typeof serverFetch = serverFetch,
): Promise<string> => {
	const body = new URLSearchParams({ ...identifier, password });
	const speakeasyHeaderName = process.env.SPEAKEASY_HTTP_HEADER_NAME;
	const speakeasyHeaderValue = process.env.SPEAKEASY_HTTP_HEADER_VALUE;

	let response;
	try {
		response = await request(url, {
			method: 'POST',
			body: body.toString(),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				...(speakeasyHeaderName && speakeasyHeaderValue ? { [speakeasyHeaderName]: speakeasyHeaderValue } : {}),
			},
			timeout: AUTHENTICATION_TIMEOUT,
			// This URL is either derived from ROOT_URL or explicitly set by an administrator.
			ignoreSsrfValidation: true,
		} as Parameters<typeof serverFetch>[1]);
	} catch (error) {
		throw new MainWebsiteAuthenticationError('Authentication service unavailable', 'service-unavailable', { cause: error });
	}

	let result: MainWebsiteAuthenticationResponse;
	try {
		result = (await response.json()) as MainWebsiteAuthenticationResponse;
	} catch (error) {
		if (response.status === 429) {
			throw new MainWebsiteAuthenticationError('Too many login attempts', 'rate-limited', { cause: error });
		}

		throw new MainWebsiteAuthenticationError('Authentication service returned an invalid response', 'service-unavailable', {
			cause: error,
		});
	}

	if (response.status === 429) {
		throw new MainWebsiteAuthenticationError('Too many login attempts', 'rate-limited');
	}

	if (response.status >= 500) {
		throw new MainWebsiteAuthenticationError('Authentication service unavailable', 'service-unavailable');
	}

	if (result.error) {
		throw new MainWebsiteAuthenticationError(String(result.error), 'invalid-credentials');
	}

	if (!response.ok || typeof result.rc_token !== 'string' || !result.rc_token) {
		throw new MainWebsiteAuthenticationError('Authentication service returned an invalid response', 'service-unavailable');
	}

	return result.rc_token;
};
