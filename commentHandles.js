/*
1. Query all the issues in the github/accessibility-governance that have the CRM label.
2. Identify any GitHub Handles (formatted @username) in the issue body.
3. If they are not already, format them as markdown inline comments (`@username`).
*/

const fs = require("node:fs/promises");
const path = require("node:path");

const owner = "github";
const repo = "accessibility-governance";
const label = "CRM";
const perPage = 100;
const handlePattern = /(^|[^`A-Za-z0-9])(@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?))(?!`)/g;

const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();

if (!token) {
	console.error("Missing GitHub token. Set GITHUB_TOKEN (or GH_TOKEN) and rerun.");
	console.error("Example: GITHUB_TOKEN=ghp_xxx node commentHandles.js");
	process.exit(1);
}

const headers = {
	Accept: "application/vnd.github+json",
	Authorization: `Bearer ${token}`,
	"X-GitHub-Api-Version": "2022-11-28"
};

const buildApiError = async (response, context) => {
	let details = "";

	try {
		const payload = await response.json();
		if (payload && typeof payload === "object") {
			const message = payload.message ? String(payload.message) : "";
			const errors = Array.isArray(payload.errors)
				? payload.errors
						.map((entry) => {
							if (typeof entry === "string") return entry;
							if (entry && typeof entry === "object") {
								return [entry.code, entry.field, entry.message].filter(Boolean).join(" ");
							}
							return "";
						})
						.filter(Boolean)
						.join("; ")
				: "";

			details = [message, errors].filter(Boolean).join(" | ");
		}
	} catch {
		// Best effort only; if parsing fails, status line still provides context.
	}

	const suffix = details ? `: ${details}` : "";
	return new Error(`${context} (${response.status} ${response.statusText})${suffix}`);
};

const runPreflightChecks = async () => {
	const authResponse = await fetch("https://api.github.com/user", { headers });
	if (!authResponse.ok) {
		throw await buildApiError(authResponse, "Token authentication failed");
	}

	const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
	if (!repoResponse.ok) {
		throw await buildApiError(
			repoResponse,
			`Cannot access repository ${owner}/${repo}`
		);
	}
};

const fetchLabeledIssues = async () => {
	const issues = [];
	let page = 1;

	while (true) {
		const url = new URL(`https://api.github.com/repos/${owner}/${repo}/issues`);
		url.searchParams.set("state", "all");
		url.searchParams.set("labels", label);
		url.searchParams.set("per_page", String(perPage));
		url.searchParams.set("page", String(page));

		const response = await fetch(url.toString(), { headers });

		if (!response.ok) {
			throw await buildApiError(response, `Failed fetching issues page ${page}`);
		}

		const pageItems = await response.json();
		if (!Array.isArray(pageItems) || pageItems.length === 0) {
			break;
		}

		for (const item of pageItems) {
			if (!item.pull_request) {
				issues.push(item);
			}
		}

		if (pageItems.length < perPage) {
			break;
		}

		page += 1;
	}

	return issues;
};

const formatHandles = (bodyText) =>
	String(bodyText || "").replace(handlePattern, (_match, prefix, handle) => `${prefix}\`${handle}\``);

const updateIssueBody = async (issueNumber, body) => {
	const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
		method: "PATCH",
		headers: {
			...headers,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ body })
	});

	if (!response.ok) {
		throw await buildApiError(response, `Failed updating issue #${issueNumber}`);
	}
};

const writeEditReport = async (issues) => {
	const generatedAt = new Date().toISOString();
	const lines = [
		`Edited issues report for ${owner}/${repo}`,
		`Label filter: ${label}`,
		`Generated at: ${generatedAt}`,
		""
	];

	if (!issues.length) {
		lines.push("No issues were edited.");
	} else {
		for (const issue of issues) {
			lines.push(`#${issue.number} - ${issue.title}`);
		}
	}

	const datePart = generatedAt.slice(0, 10);
	const reportFileName = `edited-crm-issues-${datePart}.txt`;
	const reportPath = path.join(process.cwd(), reportFileName);
	await fs.writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");

	return reportPath;
};

const main = async () => {
	await runPreflightChecks();

	const issues = await fetchLabeledIssues();

	let updatedCount = 0;
	let unchangedCount = 0;
	const updatedIssues = [];

	for (const issue of issues) {
		const originalBody = issue.body || "";
		const updatedBody = formatHandles(originalBody);

		if (updatedBody === originalBody) {
			unchangedCount += 1;
			continue;
		}

		await updateIssueBody(issue.number, updatedBody);
		updatedCount += 1;
		updatedIssues.push({ number: issue.number, title: issue.title, url: issue.html_url });
	}

	const reportPath = await writeEditReport(updatedIssues);

	if (updatedIssues.length) {
		console.table(updatedIssues);
	}

	console.log(`Finished processing ${issues.length} issue(s) with label \"${label}\".`);
	console.log(`Updated: ${updatedCount}`);
	console.log(`Unchanged: ${unchangedCount}`);
	console.log(`Report written to: ${reportPath}`);
};

main().catch((error) => {
	console.error(error);
	console.error(
		"If your token is valid but this repository is org-scoped, ensure SSO authorization and issue write permissions are enabled for the token."
	);
	process.exit(1);
});