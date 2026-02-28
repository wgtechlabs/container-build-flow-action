#!/usr/bin/env node
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};

// src/pr-comment.ts
var fs = __toESM(require("fs"));

// src/types.ts
function isTrivyOutput(data) {
  if (typeof data !== "object" || data === null)
    return false;
  const obj = data;
  return Array.isArray(obj.Results);
}
function isScanSummary(data) {
  if (typeof data !== "object" || data === null)
    return false;
  const obj = data;
  return typeof obj.completed === "boolean" && typeof obj.total === "number";
}
function isComparisonReport(data) {
  if (typeof data !== "object" || data === null)
    return false;
  const obj = data;
  return obj.comparison_available === true;
}

// src/pr-comment.ts
var FLOW_METADATA = {
  pr: {
    emoji: "\uD83D\uDD27",
    title: "PR Build",
    description: "Feature development and testing",
    color: "#0366d6"
  },
  dev: {
    emoji: "\uD83D\uDEE0️",
    title: "Dev Build",
    description: "Development and testing",
    color: "#28a745"
  },
  patch: {
    emoji: "\uD83D\uDD25",
    title: "Patch Build",
    description: "Hotfix for production",
    color: "#d73a49"
  },
  wip: {
    emoji: "⚡",
    title: "WIP Build",
    description: "Work in progress experiment",
    color: "#ffd33d"
  },
  staging: {
    emoji: "\uD83D\uDE80",
    title: "Staging Build",
    description: "Pre-production validation",
    color: "#ffd700"
  },
  release: {
    emoji: "\uD83C\uDF89",
    title: "Release Build",
    description: "Production release deployment",
    color: "#6f42c1"
  }
};
var SEVERITY_EMOJI = {
  CRITICAL: "\uD83D\uDD34",
  HIGH: "\uD83D\uDFE0",
  MEDIUM: "\uD83D\uDFE1",
  LOW: "\uD83D\uDFE2",
  UNKNOWN: "⚪"
};
function readJsonFile(path, guard) {
  try {
    if (!fs.existsSync(path))
      return null;
    const raw = JSON.parse(fs.readFileSync(path, "utf8"));
    return guard(raw) ? raw : null;
  } catch {
    return null;
  }
}
function generateSecuritySection(context, core) {
  const vulnerabilityCommentEnabled = process.env.VULNERABILITY_COMMENT_ENABLED || "true";
  const preBuildScanEnabled = process.env.PRE_BUILD_SCAN_ENABLED || "true";
  const imageScanEnabled = process.env.IMAGE_SCAN_ENABLED || "true";
  const comparisonEnabled = process.env.ENABLE_IMAGE_COMPARISON || "false";
  if (vulnerabilityCommentEnabled !== "true")
    return "";
  let section = `
---

## \uD83D\uDD12 Security Scan Results

`;
  if (preBuildScanEnabled === "true") {
    section += `### \uD83D\uDCCB Pre-Build Security Checks

`;
    const checks = [];
    const sourceResults = readJsonFile("trivy-source-results.json", isTrivyOutput);
    if (sourceResults) {
      let count = 0;
      for (const result of sourceResults.Results) {
        count += result.Vulnerabilities?.length ?? 0;
      }
      checks.push(`✅ **Source Code Scan:** ${count} vulnerabilities found`);
    } else if (fs.existsSync("trivy-source-results.json")) {
      checks.push("⚠️ **Source Code Scan:** Completed (results unavailable)");
    }
    const dockerfileResults = readJsonFile("trivy-dockerfile-results.json", isTrivyOutput);
    if (dockerfileResults) {
      let count = 0;
      for (const result of dockerfileResults.Results) {
        count += result.Misconfigurations?.length ?? 0;
      }
      checks.push(`✅ **Dockerfile Scan:** ${count} misconfigurations found`);
    } else if (fs.existsSync("trivy-dockerfile-results.json")) {
      checks.push("⚠️ **Dockerfile Scan:** Completed (results unavailable)");
    }
    section += checks.length > 0 ? checks.join(`  
`) + `

` : `*Pre-build scans were not performed or results are unavailable.*

`;
  }
  if (imageScanEnabled === "true") {
    section += `### \uD83D\uDC33 Container Image Vulnerabilities

`;
    const summary = readJsonFile("trivy-scan-summary.json", isScanSummary);
    if (summary && summary.completed) {
      let comparisonRendered = false;
      if (comparisonEnabled === "true") {
        const comparison = readJsonFile("trivy-comparison.json", isComparisonReport);
        if (comparison) {
          section += renderComparisonTable(comparison, summary);
          comparisonRendered = true;
        }
      }
      if (!comparisonRendered) {
        section += renderRegularVulnTable(summary);
      }
      section += renderVulnerabilityDetails(core);
    } else if (summary) {
      section += `*Container image scan did not complete successfully.*

`;
    } else {
      section += `*Container image was not scanned or results are unavailable.*

`;
    }
  }
  section += `### \uD83D\uDCCA Detailed Security Reports

`;
  section += `View detailed vulnerability reports in the [GitHub Security tab](${context.payload.repository.html_url}/security/code-scanning).

`;
  return section;
}
function renderComparisonTable(comparison, summary) {
  let s = `#### Vulnerability Comparison

`;
  s += `| Category | Critical | High | Medium | Low | Total |
`;
  s += `|----------|----------|------|--------|-----|-------|
`;
  s += `| \uD83C\uDD95 **New** | ${comparison.new.counts.critical} | ${comparison.new.counts.high} | ${comparison.new.counts.medium} | ${comparison.new.counts.low} | **${comparison.new.total}** |
`;
  s += `| ✅ **Fixed** | ${comparison.fixed.counts.critical} | ${comparison.fixed.counts.high} | ${comparison.fixed.counts.medium} | ${comparison.fixed.counts.low} | **${comparison.fixed.total}** |
`;
  s += `| \uD83D\uDD04 **Unchanged** | ${comparison.unchanged.counts.critical} | ${comparison.unchanged.counts.high} | ${comparison.unchanged.counts.medium} | ${comparison.unchanged.counts.low} | **${comparison.unchanged.total}** |
`;
  s += `| \uD83D\uDCCA **Current Total** | ${summary.critical} | ${summary.high} | ${summary.medium} | ${summary.low} | **${summary.total}** |

`;
  if (comparison.new.total > 0) {
    s += `⚠️ **${comparison.new.total} new vulnerabilities** introduced in this build

`;
  }
  if (comparison.fixed.total > 0) {
    s += `✅ **${comparison.fixed.total} vulnerabilities** fixed in this build

`;
  }
  return s;
}
function renderRegularVulnTable(summary) {
  let s = `| Severity | Count |
`;
  s += `|----------|-------|
`;
  if (summary.critical > 0)
    s += `| \uD83D\uDD34 **Critical** | ${summary.critical} |
`;
  if (summary.high > 0)
    s += `| \uD83D\uDFE0 **High** | ${summary.high} |
`;
  if (summary.medium > 0)
    s += `| \uD83D\uDFE1 **Medium** | ${summary.medium} |
`;
  if (summary.low > 0)
    s += `| \uD83D\uDFE2 **Low** | ${summary.low} |
`;
  s += `| **Total** | **${summary.total}** |

`;
  return s;
}
function renderVulnerabilityDetails(core) {
  const results = readJsonFile("trivy-image-results.json", isTrivyOutput);
  if (!results)
    return "";
  const hasVulns = results.Results.some((r) => r.Vulnerabilities && r.Vulnerabilities.length > 0);
  if (!hasVulns)
    return "";
  let s = `<details>
<summary>\uD83D\uDCCB View Vulnerability Details</summary>

`;
  for (const result of results.Results) {
    if (!result.Vulnerabilities || result.Vulnerabilities.length === 0)
      continue;
    s += `
**${result.Target || "Package"}**

`;
    const vulnsToShow = result.Vulnerabilities.slice(0, 20);
    for (const vuln of vulnsToShow) {
      const severity = vuln.Severity || "UNKNOWN";
      const emoji = SEVERITY_EMOJI[severity] || "⚪";
      s += `- ${emoji} **${vuln.VulnerabilityID || "UNKNOWN"}** (${severity}) - ${vuln.PkgName || "unknown"}
`;
      if (vuln.Title) {
        s += `  - ${vuln.Title}
`;
      }
      if (vuln.FixedVersion) {
        s += `  - Fixed in: \`${vuln.FixedVersion}\`
`;
      }
    }
    if (result.Vulnerabilities.length > 20) {
      s += `
*... and ${result.Vulnerabilities.length - 20} more vulnerabilities*
`;
    }
  }
  s += `
</details>

`;
  return s;
}
module.exports = async ({ github, context, core }) => {
  try {
    const buildFlowType = process.env.BUILD_FLOW_TYPE || "unknown";
    const imageTags = process.env.IMAGE_TAGS || "";
    const registryUrls = process.env.REGISTRY_URLS || "";
    const customTemplate = process.env.PR_COMMENT_TEMPLATE || "";
    const registry = process.env.REGISTRY || "both";
    const resolvedSha = process.env.RESOLVED_SHA || context.sha;
    const actionVersion = process.env.ACTION_REF || "dev";
    core.info("\uD83D\uDCDD Generating PR comment...");
    core.debug(`Flow Type: ${buildFlowType}`);
    core.debug(`Registry: ${registry}`);
    const flow = FLOW_METADATA[buildFlowType] || FLOW_METADATA.wip;
    let commentBody;
    if (customTemplate) {
      core.info("Using custom PR comment template");
      commentBody = customTemplate.replace(/{BUILD_FLOW}/g, buildFlowType).replace(/{IMAGE_TAGS}/g, imageTags).replace(/{REGISTRY_URLS}/g, registryUrls);
    } else {
      core.info("Using default PR comment template");
      const pullCommands = registryUrls.split(`
`).filter((l) => l.trim());
      const pullCommandsMarkdown = pullCommands.map((cmd) => `\`\`\`bash
${cmd}
\`\`\``).join(`

`);
      const repoUrl = context.payload.repository.html_url;
      const commitSha = resolvedSha.substring(0, 7);
      const commitUrl = `${repoUrl}/commit/${resolvedSha}`;
      const registryDisplay = {
        "docker-hub": "Docker Hub",
        ghcr: "GitHub Container Registry",
        both: "Docker Hub + GHCR"
      };
      const imageTagsList = imageTags.split(",").map((tag) => tag.trim()).filter((tag) => tag).map((tag) => `• \`${tag}\``).join("<br/>");
      const securitySection = generateSecuritySection(context, core);
      commentBody = `## ${flow.emoji} Container Build Complete - ${flow.title}

**Build Status:** ✅ Success  
**Flow Type:** \`${buildFlowType}\`  
**Description:** ${flow.description}

---

### \uD83D\uDCE6 Pull Image

${pullCommandsMarkdown}

---

### \uD83D\uDCCB Build Details

| Property | Value |
|----------|-------|
| **Flow Type** | \`${buildFlowType}\` |
| **Commit** | [\`${commitSha}\`](${commitUrl}) |
| **Registry** | ${registryDisplay[registry] || registry} |

### \uD83C\uDFF7️ Image Tags

${imageTagsList}

---

### \uD83D\uDD0D Testing Your Changes

1. **Pull the image** using one of the commands above
2. **Run the container** with your test configuration
3. **Verify** the changes work as expected
4. **Report** any issues in this PR

---

### \uD83D\uDE80 Quick Start

\`\`\`bash
# Pull and run the container
${pullCommands[0] || "docker pull <image>"}
docker run <your-options> <image>
\`\`\`

---
${securitySection}
---

<sub>\uD83E\uDD16 Powered by [Container Build Flow Action](https://github.com/wgtechlabs/container-build-flow-action) v${actionVersion}  
\uD83D\uDCBB with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) \uD83D\uDE4F</sub>`;
    }
    let prNumber = null;
    if (context.payload.pull_request) {
      prNumber = context.payload.pull_request.number;
      core.info(`\uD83D\uDCCB PR event detected: #${prNumber}`);
    } else if (context.eventName === "push" && context.ref) {
      const branch = context.ref.replace("refs/heads/", "");
      core.info(`\uD83D\uDD0D Push event detected on branch: ${branch}`);
      core.info("Searching for associated pull requests...");
      try {
        const { data: prs } = await github.rest.pulls.list({
          owner: context.repo.owner,
          repo: context.repo.repo,
          state: "open",
          head: `${context.repo.owner}:${branch}`
        });
        if (prs.length > 0) {
          prNumber = prs[0].number;
          core.info(`✅ Found associated PR #${prNumber}`);
        } else {
          core.info("ℹ️  No open PRs found for this branch");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(`Failed to search for PRs: ${message}`);
      }
    }
    if (prNumber) {
      core.info(`\uD83D\uDCAC Posting comment to PR #${prNumber}`);
      const { data: comments } = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber
      });
      const botComment = comments.find((comment) => comment.user.type === "Bot" && comment.body.includes("Container Build Complete"));
      if (botComment) {
        core.info(`\uD83D\uDD04 Updating existing comment (ID: ${botComment.id})`);
        await github.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: botComment.id,
          body: commentBody
        });
        core.info("✅ Comment updated successfully");
      } else {
        core.info("✨ Creating new comment");
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body: commentBody
        });
        core.info("✅ Comment created successfully");
      }
      core.setOutput("comment-posted", "true");
      core.info("✅ Step 3: PR comment complete!");
    } else {
      core.info("ℹ️  No associated pull request found, skipping comment");
      core.setOutput("comment-posted", "false");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack || "" : "";
    core.setFailed(`Failed to post PR comment: ${message}`);
    core.debug(stack);
  }
};
