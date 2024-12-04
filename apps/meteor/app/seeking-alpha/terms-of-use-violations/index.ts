/* eslint-disable prettier/prettier */
// Run a DB query each day, and send the results to Slack.
// The purpose of the reports are to discover abuse of our Terms of Use.

import { cronJobs } from '@rocket.chat/cron';
import { Logger } from '@rocket.chat/logger';
import { Messages } from '@rocket.chat/models';
import { Meteor } from 'meteor/meteor';

import { readSecondaryPreferred } from '../../../server/database/readSecondaryPreferred';
import { settings } from '../../settings/server';
import Slack from '../utils/Slack';
import { generateCSV } from '../utils/csv';
import { yesterday, theDayAfter } from '../utils/datetime_functions';


const CRON_JOB_NAME = 'seeking-alpha-terms-of-use-violations';
const CRON_JOB_SCHEDULE = '15 8 * * *';

// To find a Slack channel’s channel ID, open the room in the Slack UI,
// 3-dots > Open channel details > Channel ID (at bottom)
const SLACK_CHANNEL_ID_PRODUCTION = 'C07UR0ZRZ99'; // #tou-violations
const SLACK_CHANNEL_ID_STAGING    = 'C084K3AEKEH'; // #noach-alert-test

const TERMS_TO_MONITOR = [
	"discord",
	"ghost",
	"substack",
];

const LOG = new Logger('SeekingAlphaTermsOfUseCop');

Meteor.startup(async () => {
		await cronJobs.add(CRON_JOB_NAME, CRON_JOB_SCHEDULE, async () => {
		try {
			if (settings.get("Seeking_Alpha__Report_on_Terms_of_Use_Violations")) {
				LOG.info("Starting...");
				await perform();
				LOG.info("Finished!");
			}
		} catch (e: any) {
			LOG.error(`ERROR: CRONJOB: ${CRON_JOB_NAME}:`, e.message);
		}
	});
});

async function perform() {
	const slack_channel_id =
		process.env.ROOT_URL === "https://rc.seekingalpha.com"
			? SLACK_CHANNEL_ID_PRODUCTION
			: SLACK_CHANNEL_ID_STAGING;
	const slack = new Slack(process.env.SLACK_TOKEN, slack_channel_id);
	const attachments = [];

	const promises = TERMS_TO_MONITOR.map(
		keyword => aggregateMessagesContainingKeyword(keyword, yesterday())
	);
	const aggregations = await Promise.all(promises);

	TERMS_TO_MONITOR.forEach((keyword, i) => {
		const docs = aggregations[i];
		if (!Array.isArray(docs)) {
			LOG.error(`ERROR: docs for keyword "${keyword}" is not an array! docs := (${typeof docs}) ${docs}`);
			return;
		};
		if (docs.length > 0) {
			LOG.info(`Keyword "${keyword}" has ${docs.length} violations`);
			attachments.push({
				filename: `${keyword}.csv`,
				content: generateCSV(csvHeaders(), csvRecords(docs)),
			})
		};
	});

	if (attachments.length === 0) {
		LOG.info(`Posting to Slack: NO attachments`);
		await slack.post_message("No RocketChat TOU violations today!");
	} else {
		LOG.info(`Posting to Slack: ${attachments.length} attachments`);
		await slack.post_message("RocketChat TOU Violations:", attachments);
	}

	await LOG.info("Posted to Slack!");
}

function aggregateMessagesContainingKeyword(keyword, date) {
	const matchDoc = buildMongoMatchDoc(keyword, date);
	const pipeline = buildMongoPipelineArray(matchDoc);

	return Messages.col.aggregate(
		pipeline,
		{ readPreference: readSecondaryPreferred() }
	).toArray();
}

function buildMongoMatchDoc(searchPattern, date) {
	return {
		ts: {
			$gte: date,
			$lt: theDayAfter(date),
		},
		msg: RegExp(searchPattern, 'i'),
	};
}

function buildMongoPipelineArray(matchDoc) {
	const DM_ROOM = "[DM] ";

	return [
		{
			$match: matchDoc,
		},
		{
			$sort: {
				ts: 1,
			}
		},
		{
			$lookup: {
				as: "user",
				localField: "u._id",
				from: "users",
				foreignField: "_id",
			}
		},
		{
			$unwind: "$user",
		},
		{
			$lookup: {
				as: "room",
				localField: "rid",
				from: "rocketchat_room",
				foreignField: "_id",
			}
		},
		{
			$unwind: "$room",
		},
		{
			$addFields: {
				room_name: {
					$ifNull: [       // Use the first non-null value:
						"$room.fname", // Group name
						{              // "DM: #{usernames.sort.join(", ")}"
							$reduce: {
								// input: { $sortArray: {input: "$room.usernames"} },  // $sortArray added in 5.2, but we're still on 5.0.
								input: "$room.usernames",                              // For now we'll just have to leave these unsorted
								initialValue: DM_ROOM,
								in: {
									$concat: [
										"$$value",                              // the accumulator
										{
											$cond: {
												if: { $eq: ["$$value", DM_ROOM] },  // if processing the first username
												then: "",                           // ... No joiner
												else: ", "                          // ... but join with comma before others
											}
										},
										"$$this",                               // the current element
									]
								},
							}
						},
					]
				},
			}
		},
		{
			$project: {
				date: "$ts",
				sender_name: "$user.name",
				sender_id: "$user.customFields.sapi_user_id",
				room_name: "$room_name",
				msg: "$msg",
			}
		}
	];
}

function csvHeaders() {
	return [
		"Date",
		"Sender Name",
		"Sender ID",
		"Room Name",
		"Content",
	];
}

function csvRecords(docs) {
	return docs.map(doc => [
		doc.date.toISOString(),
		doc.sender_name,
		doc.sender_id,
		doc.room_name,
		doc.msg,
	]);
}
