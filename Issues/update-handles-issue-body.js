javascript:(() => {
	const textareas = [...document.querySelectorAll("textarea")];

	const isVisible = (element) => element.getClientRects().length > 0;
	const hasText = (element) => element.value.trim().length > 0;
	const handlePattern = /(^|[^`A-Za-z0-9])(@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?))(?!`)/g;

	const targetTextarea =
		(textareas.includes(document.activeElement) && hasText(document.activeElement)
			? document.activeElement
			: textareas.find((textarea) => isVisible(textarea) && hasText(textarea))) ||
		textareas.find(hasText);

	if (!targetTextarea) {
		alert("No textarea with text found.");
		return;
	}

	const original = targetTextarea.value;
	const updated = original.replace(handlePattern, (_match, prefix, handle) => `${prefix}\`${handle}\``);

	if (updated === original) {
		alert("No GitHub handles found to update.");
		return;
	}

	const nativeValueSetter = Object.getOwnPropertyDescriptor(
		window.HTMLTextAreaElement.prototype,
		"value"
	)?.set;

	if (nativeValueSetter) {
		nativeValueSetter.call(targetTextarea, updated);
	} else {
		targetTextarea.value = updated;
	}

	targetTextarea.dispatchEvent(new Event("input", { bubbles: true }));
	targetTextarea.dispatchEvent(new Event("change", { bubbles: true }));
	alert("Updated GitHub handles in the issue body.");
})();