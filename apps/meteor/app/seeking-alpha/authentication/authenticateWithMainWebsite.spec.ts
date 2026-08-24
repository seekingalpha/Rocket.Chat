import { expect } from 'chai';
import { afterEach, describe, it } from 'mocha';
import sinon from 'sinon';

import {
	authenticateWithMainWebsite,
	getMainWebsiteAuthenticationUrl,
	MainWebsiteAuthenticationError,
} from './authenticateWithMainWebsite';

describe('Seeking Alpha main website authentication', () => {
	afterEach(() => {
		delete process.env.SPEAKEASY_HTTP_HEADER_NAME;
		delete process.env.SPEAKEASY_HTTP_HEADER_VALUE;
	});

	describe('getMainWebsiteAuthenticationUrl', () => {
		it('derives the main website URL from an rc subdomain', () => {
			expect(getMainWebsiteAuthenticationUrl({ rootUrl: 'https://rc.seekingalpha.com/' })).to.equal(
				'https://seekingalpha.com/authentication/rocketchat_email_password_login',
			);
		});

		it('uses an explicit endpoint override', () => {
			expect(
				getMainWebsiteAuthenticationUrl({
					rootUrl: 'https://rc.seekingalpha.com/',
					overrideUrl: 'https://accounts.example.com/rocket-chat/login',
				}),
			).to.equal('https://accounts.example.com/rocket-chat/login');
		});

		it('disables the integration when ROOT_URL is not an rc subdomain', () => {
			expect(getMainWebsiteAuthenticationUrl({ rootUrl: 'http://localhost:3000/' })).to.be.undefined;
		});

		it('rejects an insecure external endpoint', () => {
			expect(() => getMainWebsiteAuthenticationUrl({ overrideUrl: 'http://accounts.example.com/login' })).to.throw(
				'The main website authentication URL must use HTTPS',
			);
		});
	});

	it('posts URL-encoded plaintext credentials and returns the resume token', async () => {
		process.env.SPEAKEASY_HTTP_HEADER_NAME = 'X-Speakeasy';
		process.env.SPEAKEASY_HTTP_HEADER_VALUE = 'secret';

		const request = sinon.stub().resolves({
			ok: true,
			status: 200,
			json: sinon.stub().resolves({ rc_token: 'resume-token' }),
		});

		const result = await authenticateWithMainWebsite(
			'https://seekingalpha.com/authentication/rocketchat_email_password_login',
			'user@example.com',
			'plain password',
			request,
		);

		expect(result).to.equal('resume-token');
		expect(request.calledOnce).to.be.true;

		const [url, options] = request.firstCall.args;
		expect(url).to.equal('https://seekingalpha.com/authentication/rocketchat_email_password_login');
		expect(new URLSearchParams(options.body).get('email')).to.equal('user@example.com');
		expect(new URLSearchParams(options.body).get('password')).to.equal('plain password');
		expect(options.headers).to.include({
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Speakeasy': 'secret',
		});
	});

	it('classifies an error response as invalid credentials', async () => {
		const request = sinon.stub().resolves({
			ok: false,
			status: 401,
			json: sinon.stub().resolves({ error: 'Invalid email or password' }),
		});

		try {
			await authenticateWithMainWebsite('https://example.com/login', 'user@example.com', 'password', request);
			expect.fail('Expected authentication to fail');
		} catch (error) {
			expect(error).to.be.instanceOf(MainWebsiteAuthenticationError);
			expect((error as MainWebsiteAuthenticationError).kind).to.equal('invalid-credentials');
		}
	});

	it('classifies HTTP 429 as rate limiting even when its body is not JSON', async () => {
		const request = sinon.stub().resolves({
			ok: false,
			status: 429,
			json: sinon.stub().rejects(new Error('not JSON')),
		});

		try {
			await authenticateWithMainWebsite('https://example.com/login', 'user@example.com', 'password', request);
			expect.fail('Expected authentication to fail');
		} catch (error) {
			expect(error).to.be.instanceOf(MainWebsiteAuthenticationError);
			expect((error as MainWebsiteAuthenticationError).kind).to.equal('rate-limited');
		}
	});

	it('rejects a successful response without a resume token', async () => {
		const request = sinon.stub().resolves({
			ok: true,
			status: 200,
			json: sinon.stub().resolves({}),
		});

		try {
			await authenticateWithMainWebsite('https://example.com/login', 'user@example.com', 'password', request);
			expect.fail('Expected authentication to fail');
		} catch (error) {
			expect(error).to.be.instanceOf(MainWebsiteAuthenticationError);
			expect((error as MainWebsiteAuthenticationError).kind).to.equal('service-unavailable');
		}
	});

	it('classifies a server error as service unavailable even if its body has an error field', async () => {
		const request = sinon.stub().resolves({
			ok: false,
			status: 503,
			json: sinon.stub().resolves({ error: 'Internal server error' }),
		});

		try {
			await authenticateWithMainWebsite('https://example.com/login', 'user@example.com', 'password', request);
			expect.fail('Expected authentication to fail');
		} catch (error) {
			expect(error).to.be.instanceOf(MainWebsiteAuthenticationError);
			expect((error as MainWebsiteAuthenticationError).kind).to.equal('service-unavailable');
		}
	});
});
