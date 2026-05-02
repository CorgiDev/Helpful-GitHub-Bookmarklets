const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

// List of editable variables you can set here:
    const auditRequestURL = "";
    const refiningIssueURL = "";
    const handoffIssueURL = "";
    const projectBoardURL = "";
    const serviceLabel = "";
    const projectLabel = "";
// End of editable variables

const SCREEN_READER_TERMS = [
    "NVDA",
    "JAWS",
    "VoiceOver",
    "TalkBack",
    "Narrator",
    "Orca",
    "ZoomText",
    "SuperNova",
    "Fusion",
    "screen reader",
    "screen reader",
    "Screenreader",
    "screenreader"
];

function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(String(answer || "").trim());
        });
    });
}

function runCommand(command, args) {
    const isLongRunning = command === "copilot";
    const result = spawnSync(command, args, {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        timeout: isLongRunning ? 120_000 : 30_000,
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        const stderr = String(result.stderr || "").trim();
        const stdout = String(result.stdout || "").trim();
        throw new Error(stderr || stdout || `${command} failed with exit code ${result.status}`);
    }

    return String(result.stdout || "");
}

function normalizeProjectUrl(rawUrl) {
    let value = String(rawUrl || "").trim();
    value = value.replace(/\/views\/#.*$/i, "");
    value = value.replace(/\/$/, "");
    return value;
}

function parseProjectUrl(projectUrl) {
    const match = projectUrl.match(/^https:\/\/github\.com\/(orgs|users)\/([^/]+)\/projects\/(\d+)(?:\/.*)?$/i);
    if (!match) return null;

    return {
        ownerType: match[1].toLowerCase(),
        ownerLogin: match[2],
        projectNumber: Number(match[3]),
    };
}

function toDateStamp() {
    return new Date().toISOString().slice(0, 10);
}

function toSafeFileName(value) {
    return String(value || "Project")
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80) || "Project";
}

function pluralizeIssue(count) {
    return count === 1 ? "issue" : "issues";
}

function sortEntriesByCountThenName(countMap) {
    return Object.entries(countMap).sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
    });
}

function getIssueType(title, body, labels) {
    const text = `${title}\n${body}\n${labels.join(" ")}`.toLowerCase();
    if (/color|contrast|palette|theme/.test(text)) return "Visual / Color Contrast";
    if (/keyboard|focus|tab\b|arrow key|key press|shortcut/.test(text)) return "Keyboard / Focus";
    if (/screen reader|nvda|jaws|voiceover|talkback|narrator/.test(text)) return "Screen Reader / AT";
    if (/aria|role=|accessible name|label\b|alt text/.test(text)) return "Semantics / ARIA / Labels";
    if (/form|input|button|checkbox|radio|select/.test(text)) return "Forms / Controls";
    if (/modal|dialog|popup|tooltip|toast/.test(text)) return "Overlay / Dialog";
    return "General Accessibility";
}

function ghGraphql(query, variables) {
    const args = ["api", "graphql", "-f", `query=${query}`];

    for (const [name, rawValue] of Object.entries(variables || {})) {
        if (rawValue === null || rawValue === undefined) continue;
        args.push("-F", `${name}=${rawValue}`);
    }

    const stdout = runCommand("gh", args);
    const parsed = JSON.parse(stdout);

    if (parsed.errors && parsed.errors.length > 0) {
        throw new Error(parsed.errors.map((entry) => entry.message).join("\n"));
    }

    return parsed.data;
}

function getProjectQuery(ownerType) {
    const ownerField = ownerType === "orgs" ? "organization" : "user";
    return `
query($ownerLogin: String!, $projectNumber: Int!, $cursor: String) {
  owner: ${ownerField}(login: $ownerLogin) {
    projectV2(number: $projectNumber) {
      title
      url
      items(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          content {
            ... on Issue {
              number
              title
              url
              body
              state
              labels(first: 50) {
                nodes {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
}
`;
}

function fetchAllOpenIssuesForProject(ownerType, ownerLogin, projectNumber) {
    const query = getProjectQuery(ownerType);
    let cursor = null;
    let projectTitle = "";
    let projectApiUrl = "";
    const issues = [];

    do {
        const data = ghGraphql(query, {
            ownerLogin,
            projectNumber,
            cursor,
        });

        if (!data || !data.owner || !data.owner.projectV2) {
            throw new Error("Project not found or access denied.");
        }

        const project = data.owner.projectV2;
        projectTitle = project.title;
        projectApiUrl = project.url;

        for (const item of project.items.nodes || []) {
            const issue = item.content;
            if (!issue) continue;
            if (issue.state !== "OPEN") continue;
            issues.push(issue);
        }

        cursor = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
    } while (cursor);

    return { projectTitle, projectApiUrl, issues };
}

function buildAnalysis(issues) {
    const severityCounts = {};
    const wcagCounts = {};
    const issueTypeCounts = {};
    const screenReaderIssues = [];

    const srPattern = new RegExp(SCREEN_READER_TERMS.join("|"), "i");

    for (const issue of issues) {
        const labels = (issue.labels?.nodes || []).map((entry) => entry.name).filter(Boolean);

        for (const label of labels) {
            if (label.startsWith("Severity-")) {
                severityCounts[label] = (severityCounts[label] || 0) + 1;
            }

            if (label.startsWith("WCAG ")) {
                wcagCounts[label] = (wcagCounts[label] || 0) + 1;
            }
        }

        const type = getIssueType(issue.title || "", issue.body || "", labels);
        issueTypeCounts[type] = (issueTypeCounts[type] || 0) + 1;

        if (srPattern.test(`${issue.title || ""}\n${issue.body || ""}`)) {
            screenReaderIssues.push(issue);
        }
    }

    return {
        severityCounts,
        wcagCounts,
        issueTypeCounts,
        screenReaderIssues,
    };
}

function maybeGenerateCopilotSummary(projectTitle, projectUrl, issues, analysis) {
    let summaryText = "";

    const topIssueTypes = sortEntriesByCountThenName(analysis.issueTypeCounts)
        .slice(0, 8)
        .map(([name, count]) => `- ${name}: ${count}`)
        .join("\n");

    const severitySummary = sortEntriesByCountThenName(analysis.severityCounts)
        .map(([name, count]) => `${name}=${count}`)
        .join(", ") || "none";

    const wcagSummary = sortEntriesByCountThenName(analysis.wcagCounts)
        .map(([name, count]) => `${name}=${count}`)
        .join(", ") || "none";

    const issueLines = issues.slice(0, 120).map((issue) => {
        const labels = (issue.labels?.nodes || []).map((entry) => entry.name).join(", ");
        return `- #${issue.number}: ${issue.title} | Labels: ${labels || "none"}`;
    });

    const prompt = [
        "Write a concise 1-3 paragraph markdown summary of accessibility issues on a GitHub project board.",
        "Do not include headings.",
        "Focus on patterns, recurring problem categories, likely impact, and triage recommendations.",
        "",
        `Project: ${projectTitle}`,
        `URL: ${projectUrl}`,
        `Open issues: ${issues.length}`,
        `Severity counts: ${severitySummary}`,
        `WCAG counts: ${wcagSummary}`,
        "Detected issue categories:",
        topIssueTypes || "- none",
        "",
        "Issue list sample:",
        ...issueLines,
    ].join("\n");

    let copilotFailed = false;
    try {
        summaryText = runCommand("copilot", [
            "-p",
            prompt,
            "--output-format",
            "text",
            "--allow-all-tools",
            "--allow-all-paths",
            "--no-color",
        ]).trim();
    } catch (err) {
        copilotFailed = true;
        console.warn("\nWarning: Copilot CLI summary generation failed:", err.message);
        console.warn("Falling back to computed summary.\n");
        summaryText = "";
    }

    if (summaryText) {
        console.log("Copilot summary generated successfully.");
    }

    if (!summaryText) {
        const mostCommonType = sortEntriesByCountThenName(analysis.issueTypeCounts)[0];
        const mostCommonSeverity = sortEntriesByCountThenName(analysis.severityCounts)[0];
        const mostCommonWcag = sortEntriesByCountThenName(analysis.wcagCounts)[0];

        const fallback = [];
        fallback.push(
            `This board currently has ${issues.length} open ${pluralizeIssue(issues.length)} with recurring accessibility concerns concentrated in ${mostCommonType ? `**${mostCommonType[0]}**` : "multiple categories"}.`
        );

        if (mostCommonSeverity || mostCommonWcag) {
            fallback.push(
                `Label trends suggest prioritization around ${mostCommonSeverity ? `**${mostCommonSeverity[0]}**` : "severity labels"} and frequent references to ${mostCommonWcag ? `**${mostCommonWcag[0]}**` : "WCAG criteria"}.`
            );
        }

        fallback.push(
            "Reviewing repeated issue types and assigning owners by category can improve triage speed and reduce rework across related defects."
        );

        summaryText = fallback.join("\n\n");
        if (!copilotFailed) {
            console.warn("Warning: Copilot returned an empty response. Using computed fallback summary.");
        }
    }

    return summaryText;
}

function buildMarkdown(projectTitle, projectUrl, issues, analysis, generalSummary, serviceLabel, projectLabel, auditRequestURL, refiningIssueURL, handoffIssueURL) {
    const lines = [];

    lines.push(`# Summary for ${projectTitle} Accessibility Audit\n`);
    lines.push(`This report was generated on ${new Date().toLocaleString()}.\n`);

    lines.push(`- Service Label: ${serviceLabel}`);
    lines.push(`- Project Label: ${projectLabel}`);
    lines.push(`- Audit Request URL: ${auditRequestURL}`);
    lines.push(`- Refining Request URL: ${refiningIssueURL}`);
    lines.push(`- Handoff Issue URL: ${handoffIssueURL}`);
    lines.push(`- Project Board URL: ${projectBoardURL}`);

    lines.push("\n## Issue Analysis\n");
    lines.push(`- Total number of open issues: ${issues.length}`);

    lines.push("\n### Severity Breakdown\n");
    const severityEntries = sortEntriesByCountThenName(analysis.severityCounts);
    if (severityEntries.length === 0) {
        lines.push("- No severity labels found");
    } else {
        for (const [label, count] of severityEntries) {
            lines.push(`- ${label}: ${count} ${pluralizeIssue(count)}`);
        }
    }

    lines.push("\n### WCAG Breakdown\n");
    const wcagEntries = sortEntriesByCountThenName(analysis.wcagCounts);
    if (wcagEntries.length === 0) {
        lines.push("- No WCAG labels found");
    } else {
        for (const [label, count] of wcagEntries) {
            lines.push(`- **${label}**: ${count} ${pluralizeIssue(count)}`);
        }
    }

    lines.push("\n### Possible Screen Reader Related Issues\n");
    lines.push("Issues in this section are ones that may involve issues related to how screen readers (e.g.,NVDA, JAWS, VoiceOver, TalkBack, etc.) are able to interpret the content.\n");
    if (analysis.screenReaderIssues.length === 0) {
        lines.push("- None");
    } else {
        for (const issue of analysis.screenReaderIssues) {
            lines.push(`- [**Issue #${issue.number}**: ${issue.title}](${issue.url})`);
        }
    }

    lines.push("\n## Copilot Generated Audit Summary\n");
    lines.push(generalSummary.trim());
    lines.push("\n");

    return lines.join("\n");
}

async function main() {

    console.log("GitHub Project Issue Summary Generator\n");

    try {
        runCommand("gh", ["auth", "status"]);
    } catch (error) {
        console.error("GitHub CLI is not authenticated. Run: gh auth login");
        console.error(error.message);
        process.exit(1);
    }

    const normalizedUrl = normalizeProjectUrl(projectBoardURL);
    const parsed = parseProjectUrl(normalizedUrl);

    if (!parsed) {
        console.error("Invalid project URL. Expected:");
        console.error("  https://github.com/orgs/<org>/projects/<number>");
        console.error("  https://github.com/users/<user>/projects/<number>");
        process.exit(1);
    }

    console.log("\nFetching open issues from project board...");

    const { projectTitle, projectApiUrl, issues } = fetchAllOpenIssuesForProject(
        parsed.ownerType,
        parsed.ownerLogin,
        parsed.projectNumber
    );

    const analysis = buildAnalysis(issues);
    const summaryUrl = projectApiUrl || normalizedUrl;

    console.log(`Found ${issues.length} open ${pluralizeIssue(issues.length)}.`);
    console.log("Generating general summary with Copilot CLI...");

    const generalSummary = maybeGenerateCopilotSummary(projectTitle, summaryUrl, issues, analysis);
    const markdown = buildMarkdown(projectTitle, summaryUrl, issues, analysis, generalSummary, serviceLabel, projectLabel, auditRequestURL, refiningIssueURL,handoffIssueURL);

    const fileName = `${toDateStamp()}_${toSafeFileName(projectTitle)}.md`;
    const outputPath = path.join(__dirname, fileName);

    fs.writeFileSync(outputPath, markdown, "utf8");

    console.log(`\nSummary written to: ${outputPath}`);
}

main().catch((error) => {
    console.error("Unexpected error:", error.message);
    process.exit(1);
});