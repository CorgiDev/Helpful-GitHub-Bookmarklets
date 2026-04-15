javascript:(() => {
	const textareas = document.querySelectorAll("textarea.prc-Textarea-TextArea-snlco");

	if (!textareas.length) {
		alert("No matching textarea found.");
		return;
	}

	const handleLinkPattern = /\[(@[A-Za-z0-9-]+)\]\(([^)]+)\)/g;
	let updatedCount = 0;

	for (const textarea of textareas) {
		const original = textarea.value;

		const updated = original
			.split("\n")
			.map((line) => {
				if (!/^\s*>/.test(line)) {
					return line;
				}

				return line.replace(handleLinkPattern, (_full, handle) => `\`${handle}\``);
			})
			.join("\n");

		if (updated !== original) {
			textarea.value = updated;
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
			updatedCount += 1;
		}
	}

	alert(
		updatedCount
			? `Updated ${updatedCount} textarea${updatedCount === 1 ? "" : "s"}.`
			: "No quoted handle links found to update."
	);
})();