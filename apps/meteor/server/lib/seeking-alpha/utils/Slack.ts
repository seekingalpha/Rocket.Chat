// Seeking Alpha's implementation of a Slack client.
// Mostly a wrapper around the standard Slack web-api WebClient.
//
// Docs:
// ~/code/Rocket.Chat/apps/meteor/node_modules/@slack/web-api/README.md
// https://slack.dev/node-slack-sdk/web-api
// https://api.slack.com/methods/files.getUploadURLExternal
// https://api.slack.com/methods/files.completeUploadExternal
// https://api.slack.com/methods/chat.postMessage

import { Logger } from '@rocket.chat/logger';
import { WebClient as SlackWebAPIClient } from '@slack/web-api';

export default class Slack {
	constructor(token, channel_id) {
		this.token = token;
		this.channel_id = channel_id;

		this.slackWebAPIClient = new SlackWebAPIClient(this.token);
	}

	// @param channel_id [String]
	// @param slack_markdown [semi-optional String] https://api.slack.com/reference/surfaces/formatting
	// @param attachments [semi-optional Array<{filename:, content:}>]
	//
	// At least one of `slack_markdown` and `attachments` must be present.
	//
	// @returns Promise
	//
	// Grokking the attachment API was difficult, as it is not documented well.
	// See FilesUploadV2Arguments in ~/code/Rocket.Chat/apps/meteor/node_modules/@slack/web-api/dist/methods.d.ts
	// See filesUploadV2() in /Users/noach/code/Rocket.Chat/apps/meteor/node_modules/@slack/web-api/dist/WebClient.js:289
	//   The `options` hash of `filesUploadV2()` is not directly documented, and is passed as-is
	//   to other several other functions (often indirectly!), _some_ of which document which values
	//   they look for.  ^%$#@!
	//   - e.g. getAllFileUploads(options: FilesUploadV2Arguments)
	//   - options.request_file_info [default: true] affects return value of filesUploadV2:
	//       true  => Does extra API call to get extra data.  getFileInfo(fileUploads)  Needed??
	//       false => Returns less data.
	post_message(slack_markdown = undefined, attachments = undefined) {
		if (Array.isArray(attachments) && attachments.length > 0) {
			return this.slackWebAPIClient.filesUploadV2({
				channel_id: this.channel_id,
				initial_comment: slack_markdown,
				file_uploads: attachments,
				request_file_info: false,
			});
		}

		return this.slackWebAPIClient.chat.postMessage({
			channel: this.channel_id,
			text: slack_markdown,
		});
	}
}
