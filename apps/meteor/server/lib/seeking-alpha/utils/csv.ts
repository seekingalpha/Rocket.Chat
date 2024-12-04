/* eslint-disable prettier/prettier */

// @param headers [Array<Stringy>]
// @param records [Array<Array<Stringy>>]
// @returns [String] Contents of CSV file
function generateCSV(headers, records) {
	return [
		joinRecordIntoRow(headers),
		...records.map(joinRecordIntoRow),
		"",
	].join("\n");
}

// @param record [Array<Stringy>]
// @returns [String] One row of a CSV file
function joinRecordIntoRow(record) {
	return record.map(field => escapeCSVField(field)).join(",");
}

// @param field [Stringy]
// @returns [Stringy] Escaped only if necessary
function escapeCSVField(field) {
	if (/[,"\r\n]/.test(field)) {
		const escaped = field.replace(/"/g, '""');
		return `"${escaped}"`;
	}

	return field;
}

export { generateCSV };
