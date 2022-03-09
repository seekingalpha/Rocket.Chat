import { Meteor } from 'meteor/meteor';
import s from 'underscore.string';

export const checkEmailAvailability = function(email) {
	return !Meteor.users.find({ 'emails.address': s.trim(email) }).collation({ locale: 'en', strength: 2 }).fetch()[0];
};
