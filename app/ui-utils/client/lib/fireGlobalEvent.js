import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import { Meteor } from 'meteor/meteor';

import { settings } from '../../../settings';

export const fireGlobalEvent = function _fireGlobalEvent(eventName, params) {
	window.dispatchEvent(new CustomEvent(eventName, { detail: params }));

	Tracker.autorun((computation) => {
		const enabled = settings.get('Iframe_Integration_send_enable');
		if (enabled === undefined) {
			return;
		}
		computation.stop();
		if (enabled) {
			parent.postMessage({
				eventName,
				data: params,
			}, settings.get('Iframe_Integration_send_target_origin'));
		}
	});
};

window.roomType = function _roomType(key) {
	return key === 'd' ? 'direct_msg' : 'group';
};

window.setPageKey = function _setPageKey(key) {
	Session.set('sa-page-key', key);
};

window.getPageKey = function _getPageKey() {
	let key = Session.get('sa-page-key');
	if (key) {
		return key;
	}
	key = (Math.floor(new Date().getTime() / 1000) * 1000 + Math.floor(Math.random() * 1000)).toString(36);
	Session.set('sa-page-key', key);

	return key;
};

window.fireMoneEvent = function _fireMoneEvent(t, s, a, d) {
	const params = {
		type: t,
		source: s,
		action: a,
		version: 2,
		key: window.getPageKey(),
	};
	if (d) {
		params.data = JSON.stringify(d);
	}
	$.ajax({
		type: 'POST',
		url: `https://${ location.host }/mone_event`,
		data: params,
		crossDomain: true,
		dataType: 'json',
	});
};

window.getMachineCookie = function _getMachineCookie() {
	if (!localStorage.machineCookie) {
		localStorage.machineCookie = Math.round(new Date().getTime() + Math.random() * 1000000003366).toString();
	}
	return localStorage.machineCookie;
};

window.fireMonePageEvent = function _fireMonePageEvent() {
	Session.set('page-mone-sent', true);
	if (window.top !== window) {
		return;
	}
	const d = [];
	d.push(2);
	d.push('rocketchat');
	d.push(window.getPageKey());
	d.push('');
	d.push('');
	d.push('rc.seekingalpha.com');
	d.push('');
	d.push(window.getMachineCookie());
	d.push('');
	d.push('');
	d.push('');
	d.push('');
	d.push(Meteor.userId());
	d.push('');
	d.push('');
	d.push('');
	d.push('');
	d.push('');
	d.push('');
	d.push('');

	$.ajax({
		type: 'POST',
		url: `https://${ location.host }/mone`,
		data: {
			mone: `${ d.join(';;;') } `,
		},
	});
};
