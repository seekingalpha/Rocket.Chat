/* eslint-disable prettier/prettier */

function generateCSV(headers, rows) {
	return [
		headers.join(","),
		...rows.map(row => row.map(field => escapeCSVField(field)).join(",")),
		"",
	].join("\n");
}

function escapeCSVField(field) {
	if (field.match(/[,"\r\n]/)) {
		const escaped = field.replace(/"/g, '""');
		return `"${escaped}"`;
	}

	return field;
}

export { generateCSV };
