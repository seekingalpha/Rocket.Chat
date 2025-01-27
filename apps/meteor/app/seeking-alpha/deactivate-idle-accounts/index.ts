/* eslint-disable prettier/prettier */
// Deactivate idle, unused accounts.
// We pay upstream for active users (`db.users.countDocuments({active: true})`),
// however many users don’t make use of chat.
// RocketChatAuth will still list them as active, so they’ll automatically
// reactivate here in RC once they click "Launch Chat".


import { cronJobs } from '@rocket.chat/cron';
import { Logger } from '@rocket.chat/logger';
import { Users } from '@rocket.chat/models';
import { Meteor } from 'meteor/meteor';

import { today, nDaysBeforeDate } from '../utils/datetime_functions';


const CRON_JOB_NAME = 'seeking-alpha-deactivate-idle-accounts';
const CRON_JOB_SCHEDULE = '15 10 * * *';
const MAX_IDLE_DAYS = 90;

const LOG = new Logger(CRON_JOB_NAME);

Meteor.startup(async () => {
	await cronJobs.add(CRON_JOB_NAME, CRON_JOB_SCHEDULE, async () => {
		try {
			LOG.info("Starting...");
			await perform();
			LOG.info("Finished!");
		} catch (e: any) {
			LOG.error(`ERROR: CRONJOB: ${CRON_JOB_NAME}:`, e.message);
		}
	});
});

async function perform() {
	const cutoffDate = nDaysBeforeDate(MAX_IDLE_DAYS, today());

	const response = await Users.col.updateMany(
		{
			active: true,
			createdAt: { $lt: cutoffDate },
			$or: [
				{ lastLogin: { $lt: cutoffDate } },
				{ lastLogin: { $exists: false } },
			],
		},
		{ $set: { active: false } }
	);

	await LOG.info(`${response.modifiedCount} users were deactivated!`);
}
