window.fireGlobalEvent = function _fireGlobalEvent(eventName, params) {
	window.dispatchEvent(new CustomEvent(eventName, {detail: params}));

	Tracker.autorun((computation) => {
		const enabled = RocketChat.settings.get('Iframe_Integration_send_enable');
		if (enabled === undefined) {
			return;
		}
		computation.stop();
		if (enabled) {
			parent.postMessage({
				eventName,
				data: params
			}, RocketChat.settings.get('Iframe_Integration_send_target_origin'));
		}
	});
};

window.roomType = function _roomType(key) {
	return key === 'd' ? 'direct_msg' : 'group';
};

window.getPageKey = function _getPageKey() {
	let key = Session.get('sa-page-key');
	if (key) {
		return key;
	}
	key = (Math.floor(new Date().getTime()/1000)*1000+Math.floor(Math.random()*1000)).toString(36);
	Session.set('sa-page-key', key);
	$.getJSON('https://jsonip.com/?callback=?', function(data) {
		window.fireMonePageEvent(data.ip);
	});

	return key;
};

window.fireMoneEvent = function _fireMoneEvent(t, s, a, d) {
	const params = {
		type: t,
		source: s,
		action: a,
		key: window.getPageKey()
	};
	if (d) {
		params['data'] = d;
	}
	$.ajax({
		type: 'POST',
		url: `https://${ location.host.replace('rc.', '') }/mone_event`,
		data: params
	});
};

window.fireMonePageEvent = function _fireMonePageEvent(ip) {
	const user = RocketChat.models.Users.findOne();
	const d = [];
	d.push(2);
	d.push('rocketchat');
	d.push(window.getPageKey());
	d.push('');
	d.push('');
	d.push('rc.seekingalpha.com');
	d.push('');
	d.push(ip);
	d.push('');
	d.push('');
	d.push('');
	d.push('');
	d.push(user ? user.emails[0].address : '');

	$.ajax({
		type: 'POST',
		url: `https://${ location.host.replace('rc.', '') }/mone`,
		data: {
			mone: d.join(';;;')
		}
	});
};
