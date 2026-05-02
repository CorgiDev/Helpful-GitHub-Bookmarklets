// Service worker for GitHub Offline Issue Copy extension.
// Runs when the user clicks the extension toolbar button.
// Injects the export script into the active GitHub tab in the MAIN world,
// which is required for window.showDirectoryPicker to be accessible.

chrome.action.onClicked.addListener(async (tab) => {
	if (!tab.id) return;

	try {
		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			files: ["script.js"],
			world: "MAIN"
		});
	} catch (err) {
		console.error("GitHub Offline Issue Copy: failed to inject script.", err);
	}
});
