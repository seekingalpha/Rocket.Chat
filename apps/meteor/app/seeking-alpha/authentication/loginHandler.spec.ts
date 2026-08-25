import { expect } from 'chai';
import { describe, it } from 'mocha';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

import { MainWebsiteAuthenticationError } from './authenticateWithMainWebsite';

class MeteorError extends Error {
	constructor(
		public readonly error: string | number,
		public readonly reason: string,
	) {
		super(reason);
	}
}

const loadLoginHandler = (options: { authenticationUrl?: string } = {}) => {
	const authenticationUrl = Object.hasOwn(options, 'authenticationUrl') ? options.authenticationUrl : 'https://example.com/login';
	const originalRunLoginHandlers = sinon.stub();
	const authenticateWithMainWebsite = sinon.stub();
	const loggerWarn = sinon.stub();
	const Accounts = { _runLoginHandlers: originalRunLoginHandlers };

	proxyquire.noCallThru().load('./loginHandler', {
		'@rocket.chat/logger': {
			Logger: class {
				warn = loggerWarn;
			},
		},
		'meteor/accounts-base': { Accounts },
		'meteor/meteor': { Meteor: { Error: MeteorError } },
		'./authenticateWithMainWebsite': {
			authenticateWithMainWebsite,
			getMainWebsiteAuthenticationUrl: sinon.stub().returns(authenticationUrl),
			MainWebsiteAuthenticationError,
		},
	});

	return { Accounts, authenticateWithMainWebsite, loggerWarn, originalRunLoginHandlers };
};

describe('Seeking Alpha password login handler', () => {
	it('exchanges a plaintext password for a resume token and delegates to Meteor resume login', async () => {
		const { Accounts, authenticateWithMainWebsite, originalRunLoginHandlers } = loadLoginHandler();
		const invocation = { connection: { id: 'connection-id' } };
		const resumeResult = { type: 'resume', userId: 'user-id' };

		authenticateWithMainWebsite.resolves('resume-token');
		originalRunLoginHandlers.resolves(resumeResult);

		const result = await Accounts._runLoginHandlers(invocation, {
			user: { email: 'user@example.com' },
			password: 'plaintext-password',
		});

		expect(result).to.deep.equal({ type: 'password', userId: 'user-id' });
		expect(
			authenticateWithMainWebsite.calledOnceWithExactly('https://example.com/login', { email: 'user@example.com' }, 'plaintext-password'),
		).to.be.true;
		expect(originalRunLoginHandlers.calledOnceWithExactly(invocation, { resume: 'resume-token' })).to.be.true;
	});

	it('identifies a username login with the username parameter', async () => {
		const { Accounts, authenticateWithMainWebsite, originalRunLoginHandlers } = loadLoginHandler();

		authenticateWithMainWebsite.resolves('resume-token');
		originalRunLoginHandlers.resolves({ type: 'resume', userId: 'user-id' });

		await Accounts._runLoginHandlers(
			{},
			{
				user: { username: 'some-user' },
				password: 'plaintext-password',
			},
		);

		expect(authenticateWithMainWebsite.calledOnceWithExactly('https://example.com/login', { username: 'some-user' }, 'plaintext-password'))
			.to.be.true;
	});

	it('rejects hashed password requests instead of falling back to the local password database', async () => {
		const { Accounts, authenticateWithMainWebsite, originalRunLoginHandlers } = loadLoginHandler();
		const invocation = { connection: { id: 'connection-id' } };
		const options = {
			user: { email: 'user@example.com' },
			password: { digest: 'hash', algorithm: 'sha-256' },
		};

		const result = await Accounts._runLoginHandlers(invocation, options);

		expect(authenticateWithMainWebsite.called).to.be.false;
		expect(originalRunLoginHandlers.called).to.be.false;
		expect(result.error.error).to.equal('external-authentication-requires-plaintext');
	});

	it('leaves plaintext password requests on Meteor default handlers when the integration is disabled', async () => {
		const { Accounts, authenticateWithMainWebsite, originalRunLoginHandlers } = loadLoginHandler({
			authenticationUrl: undefined,
		});
		const invocation = { connection: { id: 'connection-id' } };
		const options = { user: { email: 'user@example.com' }, password: 'plaintext-password' };

		originalRunLoginHandlers.resolves({ type: 'password', userId: 'user-id' });

		await Accounts._runLoginHandlers(invocation, options);

		expect(authenticateWithMainWebsite.called).to.be.false;
		expect(originalRunLoginHandlers.calledOnceWithExactly(invocation, options)).to.be.true;
	});

	it('leaves hashed password requests on Meteor default handlers when the integration is disabled', async () => {
		const { Accounts, authenticateWithMainWebsite, originalRunLoginHandlers } = loadLoginHandler({
			authenticationUrl: undefined,
		});
		const invocation = { connection: { id: 'connection-id' } };
		const options = {
			user: { email: 'user@example.com' },
			password: { digest: 'hash', algorithm: 'sha-256' },
		};

		originalRunLoginHandlers.resolves({ type: 'password', userId: 'user-id' });

		await Accounts._runLoginHandlers(invocation, options);

		expect(authenticateWithMainWebsite.called).to.be.false;
		expect(originalRunLoginHandlers.calledOnceWithExactly(invocation, options)).to.be.true;
	});

	it('returns a failed password result so Rocket.Chat failed-login hooks still run', async () => {
		const { Accounts, authenticateWithMainWebsite, originalRunLoginHandlers } = loadLoginHandler();
		const invocation = { connection: { id: 'connection-id' } };

		authenticateWithMainWebsite.rejects(new MainWebsiteAuthenticationError('Invalid credentials', 'invalid-credentials'));

		const result = await Accounts._runLoginHandlers(invocation, {
			user: { email: 'user@example.com' },
			password: 'wrong-password',
		});

		expect(originalRunLoginHandlers.called).to.be.false;
		expect(result.type).to.equal('password');
		expect(result.error).to.be.instanceOf(MeteorError);
		expect(result.error.error).to.equal(401);
		expect(result.error.reason).to.equal('User not found');
	});

	it('fails closed when the external authentication URL is invalid', async () => {
		const originalRunLoginHandlers = sinon.stub();
		const loggerWarn = sinon.stub();
		const Accounts = { _runLoginHandlers: originalRunLoginHandlers };

		proxyquire.noCallThru().load('./loginHandler', {
			'@rocket.chat/logger': {
				Logger: class {
					warn = loggerWarn;
				},
			},
			'meteor/accounts-base': { Accounts },
			'meteor/meteor': { Meteor: { Error: MeteorError } },
			'./authenticateWithMainWebsite': {
				authenticateWithMainWebsite: sinon.stub(),
				getMainWebsiteAuthenticationUrl: sinon.stub().throws(new TypeError('Invalid URL')),
				MainWebsiteAuthenticationError,
			},
		});

		const result = await Accounts._runLoginHandlers(
			{},
			{
				user: { email: 'user@example.com' },
				password: 'plaintext-password',
			},
		);

		expect(originalRunLoginHandlers.called).to.be.false;
		expect(loggerWarn.calledOnce).to.be.true;
		expect(result.error.error).to.equal('external-authentication-unavailable');
	});
});
