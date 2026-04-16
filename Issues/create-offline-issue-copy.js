javascript:(async () => {
	if (typeof window.showDirectoryPicker !== "function") {
		alert(
			"This bookmarklet needs the File System Access API. Use Chromium-based browsers (for example Chrome or Edge)."
		);
		return;
	}

	const pageTypePattern = /\/issues\/\d+|\/pull\/\d+|\/discussions\/\d+/;
	if (!pageTypePattern.test(location.pathname)) {
		alert("Open a GitHub issue, pull request, or discussion page first.");
		return;
	}

	const routeMatch = location.pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull|discussions)\/(\d+)/i);
	const routeInfo = routeMatch
		? {
				owner: routeMatch[1],
				repo: routeMatch[2],
				kind: routeMatch[3].toLowerCase(),
				number: Number(routeMatch[4])
		  }
		: null;

	const toAbsoluteUrl = (rawUrl) => {
		try {
			return new URL(rawUrl, location.href).href;
		} catch {
			return "";
		}
	};

	const escapeHtml = (value) =>
		String(value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/\"/g, "&quot;")
			.replace(/'/g, "&#39;");

	const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();

	const firstNonEmpty = (...values) => {
		for (const value of values) {
			const normalized = normalizeWhitespace(value);
			if (normalized) return normalized;
		}
		return "";
	};

	const sanitizeFileName = (value) =>
		String(value || "")
			.replace(/[\\/:*?"<>|]+/g, "-")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 120);

	const extensionFromMime = (mimeType) => {
		const map = {
			"image/jpeg": ".jpg",
			"image/png": ".png",
			"image/gif": ".gif",
			"image/webp": ".webp",
			"image/svg+xml": ".svg",
			"image/avif": ".avif",
			"video/mp4": ".mp4",
			"video/webm": ".webm",
			"video/ogg": ".ogv",
			"video/quicktime": ".mov"
		};
		return map[mimeType.toLowerCase()] || "";
	};

	const extensionFromUrl = (rawUrl) => {
		try {
			const path = new URL(rawUrl).pathname;
			const match = path.match(/\.([a-zA-Z0-9]{2,8})$/);
			return match ? `.${match[1].toLowerCase()}` : "";
		} catch {
			return "";
		}
	};

	const isMediaLikeUrl = (rawUrl) => {
		if (!rawUrl) return false;
		try {
			const parsed = new URL(rawUrl);
			if (/^avatars\.githubusercontent\.com$/i.test(parsed.hostname)) return false;
			const mediaExtPattern = /\.(png|jpe?g|gif|webp|svg|bmp|avif|mp4|mov|webm|ogg|m4v|avi)(\?|#|$)/i;
			if (mediaExtPattern.test(parsed.href)) return true;
			if (/(^|\.)githubusercontent\.com$/i.test(parsed.hostname)) return true;
			if (/^github\.com$/i.test(parsed.hostname) && /^\/user-attachments\/assets\//i.test(parsed.pathname)) {
				return true;
			}
			return false;
		} catch {
			return false;
		}
	};

	const fileNameFromUrl = (rawUrl) => {
		try {
			const parsed = new URL(rawUrl);
			const candidate = parsed.pathname.split("/").pop() || "file";
			return sanitizeFileName(candidate) || "file";
		} catch {
			return "file";
		}
	};

	const createFailedAssetNotice = (rawUrl) => {
		const box = document.createElement("div");
		box.className = "asset-download-failed";

		const fileName = fileNameFromUrl(rawUrl);
		const escapedFileName = escapeHtml(fileName);
		const escapedUrl = escapeHtml(rawUrl);
		box.innerHTML =
			`<strong>${escapedFileName} could not be downloaded.</strong> ` +
			`Try accessing the media at <a href="${escapedUrl}">${escapedUrl}</a> ` +
			`or contact whomever provided you with the file.`;

		return box;
	};

	const uniqueByIdentity = (nodes) => {
		const seen = new Set();
		const output = [];
		for (const node of nodes) {
			if (!node || seen.has(node)) continue;
			seen.add(node);
			output.push(node);
		}
		return output;
	};

	const htmlFromMarkdown = (markdownText) => {
		const escaped = escapeHtml(markdownText || "");
		return escaped.replace(/\n/g, "<br>");
	};

	const sanitizeExportBody = (rootElement) => {
		for (const scriptNode of rootElement.querySelectorAll("script")) {
			scriptNode.remove();
		}
		for (const buttonNode of rootElement.querySelectorAll("button")) {
			buttonNode.remove();
		}
		for (const tooltipNode of rootElement.querySelectorAll("span.prc-TooltipV2-Tooltip-tLeuB")) {
			if (/\bReact\b/.test(tooltipNode.textContent)) {
				tooltipNode.remove();
			}
		}
	};

	const extractPageTitle = () => {
		const selectors = [
			"[data-testid='issue-title']",
			"[data-testid='issue-viewer-issue-title']",
			".js-issue-title",
			"h1.gh-header-title .js-issue-title",
			"h1.gh-header-title",
			"main h1",
			"h1"
		];

		for (const selector of selectors) {
			const node = document.querySelector(selector);
			const text = firstNonEmpty(node ? node.textContent : "");
			if (text) return text;
		}

		return "";
	};

	const collectTextValues = (selectors) => {
		const values = [];
		for (const selector of selectors) {
			for (const node of document.querySelectorAll(selector)) {
				const text = firstNonEmpty(node.textContent, node.getAttribute("aria-label"), node.getAttribute("title"));
				if (text) values.push(text);
			}
		}
		return [...new Set(values)];
	};

	const mergeMetadata = (...sources) => {
		const merged = {};
		for (const source of sources) {
			for (const [key, value] of Object.entries(source || {})) {
				const normalizedValue = firstNonEmpty(value);
				if (!normalizedValue) continue;
				if (!merged[key] || merged[key] === "None") {
					merged[key] = normalizedValue;
				}
			}
		}
		return merged;
	};

	const fetchIssueDataFromApi = async () => {
		if (!routeInfo) return null;
		if (routeInfo.kind !== "issues" && routeInfo.kind !== "pull") return null;

		const headers = {
			Accept: "application/vnd.github.full+json, application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28"
		};

		const issueUrl = `https://api.github.com/repos/${routeInfo.owner}/${routeInfo.repo}/issues/${routeInfo.number}`;
		const commentsUrl = `${issueUrl}/comments?per_page=100`;

		const issueResponse = await fetch(issueUrl, { headers });
		if (!issueResponse.ok) {
			throw new Error(`Issue API request failed (${issueResponse.status})`);
		}

		const issue = await issueResponse.json();

		const commentsResponse = await fetch(commentsUrl, { headers });
		if (!commentsResponse.ok) {
			throw new Error(`Comments API request failed (${commentsResponse.status})`);
		}

		const issueComments = await commentsResponse.json();

		const comments = [];
		const issueBodyHtml = issue.body_html || htmlFromMarkdown(issue.body || "");
		const issueBodyContainer = document.createElement("div");
		issueBodyContainer.innerHTML = issueBodyHtml;
		sanitizeExportBody(issueBodyContainer);
		comments.push({
			author: issue.user && issue.user.login ? issue.user.login : "Unknown",
			timeText: issue.created_at || "",
			bodyClone: issueBodyContainer
		});

		for (const item of issueComments) {
			const bodyHtml = item.body_html || htmlFromMarkdown(item.body || "");
			const bodyContainer = document.createElement("div");
			bodyContainer.innerHTML = bodyHtml;
			sanitizeExportBody(bodyContainer);
			comments.push({
				author: item.user && item.user.login ? item.user.login : "Unknown",
				timeText: item.created_at || "",
				bodyClone: bodyContainer
			});
		}

		const metadata = {
			State: normalizeWhitespace(issue.state || "Unknown"),
			Status: normalizeWhitespace(issue.state_reason || ""),
			Labels: issue.labels && issue.labels.length
				? issue.labels.map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean).join(", ")
				: "None",
			Assignees: issue.assignees && issue.assignees.length
				? issue.assignees.map((assignee) => assignee.login).filter(Boolean).join(", ")
				: "None",
			Milestone: issue.milestone && issue.milestone.title ? issue.milestone.title : "None",
			Author: issue.user && issue.user.login ? issue.user.login : "Unknown",
			Created: normalizeWhitespace(issue.created_at || ""),
			Updated: normalizeWhitespace(issue.updated_at || ""),
			Closed: normalizeWhitespace(issue.closed_at || ""),
			Comments: String(typeof issue.comments === "number" ? issue.comments : "")
		};

		if (issue.pull_request) {
			metadata.Type = "Pull Request";
		} else {
			metadata.Type = "Issue";
		}

		return {
			titleText: normalizeWhitespace(issue.title || document.title),
			stateText: normalizeWhitespace(issue.state || ""),
			sidebarMetadata: metadata,
			comments
		};
	};

	let titleText = "";
	let stateText = "";
	const pageUrl = location.href;
	let sidebarMetadata = {};
	let comments = [];

	let usedApiData = false;
	try {
		const apiData = await fetchIssueDataFromApi();
		if (apiData && apiData.comments.length) {
			titleText = apiData.titleText;
			stateText = apiData.stateText;
			sidebarMetadata = apiData.sidebarMetadata;
			comments = apiData.comments;
			usedApiData = true;
		}
	} catch (error) {
		console.warn("Offline export API fetch failed, falling back to DOM parsing.", error);
	}

	const pageTitle = extractPageTitle();
	if (pageTitle) {
		titleText = pageTitle;
	} else if (!usedApiData) {
		titleText = normalizeWhitespace(document.title);
	}

	if (!usedApiData) {
		const stateNode = document.querySelector(".gh-header-meta .State, [data-issue-and-pr-state], [data-testid='issue-state']");
		stateText = firstNonEmpty(stateNode ? stateNode.textContent : "", stateNode ? stateNode.getAttribute("aria-label") : "");
	}
	if (!usedApiData) {
		const metadataItems = document.querySelectorAll(
			".discussion-sidebar-item, .Layout-sidebar .discussion-sidebar-item, [data-testid^='sidebar-']"
		);
		const domMetadata = {};
		for (const item of metadataItems) {
			const headingNode = item.querySelector("h3, h2, strong, [data-testid$='-header']");
			const heading = firstNonEmpty(
				headingNode ? headingNode.textContent : "",
				item.getAttribute("aria-label"),
				item.getAttribute("data-testid")
			);
			if (!heading) continue;

			const values = [];
			const valueNodes = item.querySelectorAll("a, span, strong, li, summary, div");
			for (const valueNode of valueNodes) {
				const text = normalizeWhitespace(valueNode.textContent);
				if (!text) continue;
				if (text.toLowerCase() === heading.toLowerCase()) continue;
				values.push(text);
			}

			const deduped = [...new Set(values)];
			const fallbackText = normalizeWhitespace(item.textContent).replace(new RegExp(`^${heading}`, "i"), "").trim();
			domMetadata[heading] = deduped.length ? deduped.join(", ") : fallbackText || "None";
		}

		const labelValues = collectTextValues([
			"a.IssueLabel",
			".js-issue-labels a",
			"[data-testid='issue-labels'] a",
			"[data-testid='sidebar-labels'] a",
			"[aria-label='Labels'] a"
		]);

		const assigneeValues = collectTextValues([
			"[aria-label='Assignees'] a",
			".assignee .css-truncate-target",
			"[data-testid='sidebar-assignees'] a",
			"[data-testid='sidebar-assignees'] img[alt]",
			"[aria-label*='assignee' i] a",
			"[aria-label*='assignee' i] img[alt]"
		]).map((value) => value.replace(/^@+/, ""));

		const authorValues = collectTextValues([
			"a.author",
			"[data-testid='author-link']",
			"[rel='author']"
		]).map((value) => value.replace(/^@+/, ""));

		const milestoneValues = collectTextValues([
			"[aria-label='Milestone'] a",
			"[data-testid='sidebar-milestone'] a"
		]);

		sidebarMetadata = mergeMetadata(domMetadata, {
			Labels: labelValues.length ? labelValues.join(", ") : "",
			Assignees: assigneeValues.length ? [...new Set(assigneeValues)].join(", ") : "",
			Author: authorValues[0] || "",
			Milestone: milestoneValues[0] || "",
			State: stateText
		});

		const commentCandidates = uniqueByIdentity(
			[
				...document.querySelectorAll(".timeline-comment"),
				...document.querySelectorAll(".js-comment-container"),
				...document.querySelectorAll("[data-testid='issue-comment-viewer']"),
				...document.querySelectorAll(".js-discussion .comment"),
				...document.querySelectorAll("[data-testid='issue-viewer-issue-container']"),
				...document.querySelectorAll("[data-testid='issue-viewer-comments-container'] > *")
			]
		);

		for (const candidate of commentCandidates) {
			const bodyNode = candidate.querySelector(
				".comment-body, .markdown-body, [data-testid='markdown-body'], [data-testid='issue-body']"
			);
			if (!bodyNode) continue;

			const bodyClone = bodyNode.cloneNode(true);
			sanitizeExportBody(bodyClone);

			const authorNode = candidate.querySelector(".author, a.author, .Link--primary, [data-testid='author-link']");
			const timeNode = candidate.querySelector("relative-time, time");
			const author = normalizeWhitespace(authorNode ? authorNode.textContent : "Unknown");
			const timeText = normalizeWhitespace(
				timeNode ? timeNode.getAttribute("datetime") || timeNode.textContent : ""
			);

			comments.push({
				author,
				timeText,
				bodyClone
			});
		}

		if (!comments.length) {
			const fallbackBody = document.querySelector(".markdown-body, [data-testid='markdown-body']");
			if (fallbackBody) {
				const bodyClone = fallbackBody.cloneNode(true);
				sanitizeExportBody(bodyClone);
				comments.push({ author: "Content", timeText: "", bodyClone });
			}
		}
	}

	if (!comments.length) {
		alert("No issue or discussion body content found to export.");
		return;
	}

	const assetRefs = [];
	const addAssetRef = (element, attrName, rawUrl) => {
		const absolute = toAbsoluteUrl(rawUrl);
		if (!absolute) return;
		if (!isMediaLikeUrl(absolute)) return;
		assetRefs.push({ element, attrName, originalUrl: absolute });
	};

	for (const comment of comments) {
		const { bodyClone } = comment;

		for (const img of bodyClone.querySelectorAll("img[src]")) {
			addAssetRef(img, "src", img.getAttribute("src"));
		}

		for (const video of bodyClone.querySelectorAll("video[src], video[poster]")) {
			if (video.hasAttribute("src")) addAssetRef(video, "src", video.getAttribute("src"));
			if (video.hasAttribute("poster")) addAssetRef(video, "poster", video.getAttribute("poster"));
		}

		for (const source of bodyClone.querySelectorAll("video source[src]")) {
			addAssetRef(source, "src", source.getAttribute("src"));
		}

		for (const link of bodyClone.querySelectorAll("a[href]")) {
			addAssetRef(link, "href", link.getAttribute("href"));
		}
	}

	const uniqueAssetUrls = [...new Set(assetRefs.map((item) => item.originalUrl))];

	const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
	const assetsDirectoryHandle = await directoryHandle.getDirectoryHandle("assets", { create: true });

	const urlToLocalPath = new Map();
	const usedNames = new Set();
	const failedAssets = [];

	for (let index = 0; index < uniqueAssetUrls.length; index += 1) {
		const assetUrl = uniqueAssetUrls[index];
		try {
			const response = await fetch(assetUrl, { credentials: "include" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);

			const blob = await response.blob();
			const responseMime = (response.headers.get("content-type") || blob.type || "").split(";")[0];
			const ext = extensionFromUrl(assetUrl) || extensionFromMime(responseMime) || ".bin";

			let baseName = sanitizeFileName(new URL(assetUrl).pathname.split("/").pop() || "asset");
			if (!baseName) baseName = `asset-${index + 1}`;
			if (!baseName.toLowerCase().endsWith(ext.toLowerCase())) baseName += ext;

			let fileName = baseName;
			let suffix = 1;
			while (usedNames.has(fileName)) {
				const nameWithoutExt = fileName.slice(0, -ext.length);
				fileName = `${nameWithoutExt}-${suffix}${ext}`;
				suffix += 1;
			}
			usedNames.add(fileName);

			const fileHandle = await assetsDirectoryHandle.getFileHandle(fileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(blob);
			await writable.close();

			urlToLocalPath.set(assetUrl, `assets/${fileName}`);
		} catch (error) {
			failedAssets.push({ url: assetUrl, reason: error instanceof Error ? error.message : String(error) });
		}
	}

	for (const ref of assetRefs) {
		const local = urlToLocalPath.get(ref.originalUrl);
		if (!local) continue;
		ref.element.setAttribute(ref.attrName, local);
	}

	const failedAssetUrls = new Set(failedAssets.map((item) => item.url));
	for (const ref of assetRefs) {
		if (!failedAssetUrls.has(ref.originalUrl)) continue;
		if (ref.element.hasAttribute("data-offline-asset-replaced")) continue;

		const notice = createFailedAssetNotice(ref.originalUrl);

		if (ref.element.tagName.toLowerCase() === "source" && ref.element.parentElement) {
			const mediaParent = ref.element.closest("video, audio");
			if (mediaParent && !mediaParent.hasAttribute("data-offline-asset-replaced")) {
				mediaParent.replaceWith(notice);
				notice.setAttribute("data-offline-asset-replaced", "true");
			} else {
				ref.element.replaceWith(notice);
				notice.setAttribute("data-offline-asset-replaced", "true");
			}
			continue;
		}

		ref.element.replaceWith(notice);
		notice.setAttribute("data-offline-asset-replaced", "true");
	}

	const assigneesValue = firstNonEmpty(sidebarMetadata.Assignees);
	if (/no one\s*-\s*assign yourself/i.test(assigneesValue)) {
		sidebarMetadata.Assignees = "No assignees";
	}

	const metadataEntries = Object.entries(sidebarMetadata).sort(([a], [b]) => a.localeCompare(b));
	const metadataHtml = metadataEntries.length
		? metadataEntries
				.map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
				.join("")
		: "<tr><th>Metadata</th><td>None found</td></tr>";

	const commentsHtml = comments
		.map((comment, idx) => {
			const timeBlock = comment.timeText ? `<time>${escapeHtml(comment.timeText)}</time>` : "";
			return `
				<article class="entry">
					<header>
						<h3>${escapeHtml(comment.author)}</h3>
						${timeBlock}
						<span class="index">#${idx + 1}</span>
					</header>
					<section class="markdown-body">${comment.bodyClone.innerHTML}</section>
				</article>
			`;
		})
		.join("\n");

	const generatedAt = new Date().toISOString();
	const offlineHtml = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(titleText)} - Offline Copy</title>
	<style>
		:root {
			color-scheme: light;
			--bg: #f6f8fa;
			--surface: #ffffff;
			--text: #1f2328;
			--muted: #59636e;
			--border: #d0d7de;
			--accent: #0969da;
		}
		* { box-sizing: border-box; }
		body {
			margin: 0;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
			color: var(--text);
			background: var(--bg);
			line-height: 1.45;
		}
		main {
			max-width: 980px;
			margin: 0 auto;
			padding: 24px 16px 56px;
		}
		.card {
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 8px;
			margin-bottom: 16px;
			padding: 16px;
		}
		h1, h2, h3 { margin: 0 0 8px; }
		h1 { font-size: 1.5rem; }
		h2 { font-size: 1.1rem; }
		.meta-line { color: var(--muted); margin-top: 8px; }
		.state {
			display: inline-block;
			margin-left: 8px;
			padding: 2px 8px;
			border: 1px solid var(--border);
			border-radius: 999px;
			color: var(--muted);
			font-size: 0.85rem;
			vertical-align: middle;
		}
		table {
			width: 100%;
			border-collapse: collapse;
		}
		th, td {
			border: 1px solid var(--border);
			padding: 8px;
			text-align: left;
			vertical-align: top;
		}
		th {
			width: 180px;
			background: #f6f8fa;
			color: var(--muted);
			font-weight: 600;
		}
		.entry {
			border: 1px solid var(--border);
			border-radius: 8px;
			margin-bottom: 16px;
			overflow: hidden;
		}
		.entry > header {
			background: #f6f8fa;
			border-bottom: 1px solid var(--border);
			padding: 10px 12px;
			display: flex;
			gap: 10px;
			align-items: baseline;
			flex-wrap: wrap;
		}
		.entry .index {
			margin-left: auto;
			color: var(--muted);
			font-size: 0.85rem;
		}
		.entry .markdown-body {
			padding: 14px 12px;
		}
		.markdown-body img, .markdown-body video {
			max-width: 100%;
			height: auto;
		}
		.asset-download-failed {
			background: #E3C565;
			border: 3px solid #000000;
			padding: 10px 12px;
			margin: 8px 0;
			font-size: 0.95rem;
			line-height: 1.4;
		}
		.asset-download-failed strong {
			display: block;
			margin-bottom: 4px;
		}
		.asset-download-failed a {
			color: #000000;
			text-decoration: underline;
			word-break: break-all;
		}
		a { color: var(--accent); }
		code, pre {
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
		}
	</style>
</head>
<body>
	<main>
		<section class="card">
			<h1>${escapeHtml(titleText)}${stateText ? `<span class="state">${escapeHtml(stateText)}</span>` : ""}</h1>
			<p class="meta-line">Original URL: <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></p>
			<p class="meta-line">Generated at: ${escapeHtml(generatedAt)}</p>
		</section>

		<section class="card">
			<h2>Metadata</h2>
			<table>${metadataHtml}</table>
		</section>

		<section class="card">
			<h2>Conversation</h2>
			${commentsHtml}
		</section>
	</main>
</body>
</html>`;

	const itemTypeByKind = {
		pull: "PR",
		issues: "Issue",
		discussions: "Discussion"
	};
	const defaultBaseName = routeInfo
		? `${itemTypeByKind[routeInfo.kind] || "Item"}-${routeInfo.number}`
		: titleText || "github-item";
	const defaultName = sanitizeFileName(defaultBaseName) || "github-item";
	const selectedNameRaw = prompt("File name for the offline HTML copy:", defaultName);
	if (selectedNameRaw === null) {
		alert("Export canceled.");
		return;
	}

	const selectedName = sanitizeFileName(selectedNameRaw) || defaultName;
	const finalName = selectedName.toLowerCase().endsWith(".html") ? selectedName : `${selectedName}.html`;
	const htmlFileHandle = await directoryHandle.getFileHandle(finalName, { create: true });
	const htmlWritable = await htmlFileHandle.createWritable();
	await htmlWritable.write(offlineHtml);
	await htmlWritable.close();

	const downloaded = urlToLocalPath.size;
	const failed = failedAssets.length;
	const message = [
		`Saved ${finalName} and assets folder in the selected directory.`,
		`Downloaded media files: ${downloaded}`,
		`Failed media files: ${failed}`
	];
	if (failed) {
		message.push("Failed media references were replaced with warning boxes in the offline copy.");
	}
	alert(message.join("\n"));
})();