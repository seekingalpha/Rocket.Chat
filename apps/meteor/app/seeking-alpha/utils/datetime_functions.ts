export function yesterday() {
	return theDayBefore(today());
}

export function today() {
	return startOfDay(new Date());
}

export function startOfDay(date) {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}

export function theDayBefore(date) {
	return nDaysBeforeDate(1, date);
}

export function theDayAfter(date) {
	return nDaysAfterDate(1, date);
}

export function nDaysBeforeDate(numDays, date) {
	const d = new Date(date);
	d.setUTCDate(d.getUTCDate() - numDays);
	return d;
}

export function nDaysAfterDate(numDays, date) {
	const d = new Date(date);
	d.setUTCDate(d.getUTCDate() + numDays);
	return d;
}
