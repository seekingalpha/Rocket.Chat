import { Uploads } from '@rocket.chat/models';
import { WebApp } from 'meteor/webapp';

import { FileUpload } from './FileUpload';
import { Logger } from '@rocket.chat/logger';

WebApp.connectHandlers.use(FileUpload.getPath(), async (req, res, next) => {
	const log = new Logger('FileUpload').logger.child({
		url: req.url,
		userAgent: req.headers['user-agent'],
		userId: req.headers['x-user-id'],
		host: req.headers.host,
		referer: req.headers.referer,
		headers: req.headers,
	});

	log.http({
		stage: 'start',
	});

	const match = /^\/([^\/]+)\/(.*)/.exec(req.url || '');

	if (match?.[1]) {
		const file = await Uploads.findOneById(match[1]);

		if (file) {
			if (!(await FileUpload.requestCanAccessFiles(req, file))) {
				res.writeHead(403);
				return res.end();
			}

			res.setHeader('Content-Security-Policy', "default-src 'none'");
			res.setHeader('Cache-Control', 'max-age=31536000');
			return FileUpload.get(file, req, res, next);
		}
	}

	res.writeHead(404);
	res.end();
});
