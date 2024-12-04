/* eslint-disable prettier/prettier */

// WARNING: This code is currently hardwired to term-of-use-violations.
// Needs to be abstracted into a generic TSV implementation.
function generateTSV(docs) {
	const headers = ["Date", "Sender Name", "Sender ID", "Room Name", "Content"];
	const rows = docs.map(doc =>
		[
			doc.date.toISOString(),
			doc.sender_name,
			doc.sender_id,
			doc.room_name,
			escapeTSVField(doc.msg),
		]
	);

	return [
		headers.join("\t"),
		...rows.map(row => row.join("\t")),
		"",
	].join("\n");
}

function escapeTSVField(fieldContents) {
  const escaped =
    fieldContents
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/"/g, '""');

	return `"${escaped}"`;
}

export { generateTSV };
