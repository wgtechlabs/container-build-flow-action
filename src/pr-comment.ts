#!/usr/bin/env node
/**
 * PR Comment Script
 * ==================
 * Generates and posts formatted PR comments with docker pull instructions,
 * security scan results, and vulnerability comparison tables.
 *
 * Type safety is enforced at every JSON parse boundary via type guards.
 * Internal logic operates on fully typed structures — redundant defensive
 * `Array.isArray()` checks from Issue #4 have been replaced by the type
 * system (Issue #9).
 *
 * Environment Variables:
 *   BUILD_FLOW_TYPE           : Detected flow (pr, dev, patch, staging, wip)
 *   IMAGE_TAGS                : Comma-separated image tags
 *   REGISTRY_URLS             : Registry pull commands
 *   PR_COMMENT_TEMPLATE       : Optional custom template
 *   REGISTRY                  : Target registry config
 *   RESOLVED_SHA              : Resolved commit SHA
 *   VULNERABILITY_COMMENT_ENABLED : Enable vulnerability section
 *   PRE_BUILD_SCAN_ENABLED    : Enable pre-build scan results
 *   IMAGE_SCAN_ENABLED        : Enable image scan results
 *   ENABLE_IMAGE_COMPARISON   : Enable comparison table
 *   ACTION_REF                : Action version reference
 */

import * as fs from 'fs';
import {
  BuildFlowType,
  ComparisonReport,
  FlowMetadata,
  GitHubActionsCore,
  GitHubClient,
  GitHubContext,
  ScanSummary,
  TrivyOutput,
  Vulnerability,
  isComparisonReport,
  isScanSummary,
  isTrivyOutput,
} from './types';

// =============================================================================
// FLOW TYPE METADATA
// =============================================================================

const FLOW_METADATA: Record<string, FlowMetadata> = {
  pr: {
    emoji: '🔧',
    title: 'PR Build',
    description: 'Feature development and testing',
    color: '#0366d6',
  },
  dev: {
    emoji: '🛠️',
    title: 'Dev Build',
    description: 'Development and testing',
    color: '#28a745',
  },
  patch: {
    emoji: '🔥',
    title: 'Patch Build',
    description: 'Hotfix for production',
    color: '#d73a49',
  },
  wip: {
    emoji: '⚡',
    title: 'WIP Build',
    description: 'Work in progress experiment',
    color: '#ffd33d',
  },
  staging: {
    emoji: '🚀',
    title: 'Staging Build',
    description: 'Pre-production validation',
    color: '#ffd700',
  },
  release: {
    emoji: '🎉',
    title: 'Release Build',
    description: 'Production release deployment',
    color: '#6f42c1',
  },
};

const SEVERITY_EMOJI: Record<string, string> = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🟢',
  UNKNOWN: '⚪',
};

// =============================================================================
// HELPER — Safe JSON file reader with type guard
// =============================================================================

function readJsonFile<T>(
  path: string,
  guard: (data: unknown) => data is T,
): T | null {
  try {
    if (!fs.existsSync(path)) return null;
    const raw: unknown = JSON.parse(fs.readFileSync(path, 'utf8'));
    return guard(raw) ? raw : null;
  } catch {
    return null;
  }
}

// =============================================================================
// SECURITY SECTION GENERATION
// =============================================================================

function generateSecuritySection(
  context: GitHubContext,
  core: GitHubActionsCore,
): string {
  const vulnerabilityCommentEnabled = process.env.VULNERABILITY_COMMENT_ENABLED || 'true';
  const preBuildScanEnabled = process.env.PRE_BUILD_SCAN_ENABLED || 'true';
  const imageScanEnabled = process.env.IMAGE_SCAN_ENABLED || 'true';
  const comparisonEnabled = process.env.ENABLE_IMAGE_COMPARISON || 'false';

  if (vulnerabilityCommentEnabled !== 'true') return '';

  let section = '\n---\n\n## 🔒 Security Scan Results\n\n';

  // ---------------------------------------------------------------------------
  // Pre-Build Scan Results
  // ---------------------------------------------------------------------------
  if (preBuildScanEnabled === 'true') {
    section += '### 📋 Pre-Build Security Checks\n\n';
    const checks: string[] = [];

    // Source code scan
    const sourceResults = readJsonFile('trivy-source-results.json', isTrivyOutput);
    if (sourceResults) {
      let count = 0;
      for (const result of sourceResults.Results) {
        count += result.Vulnerabilities?.length ?? 0;
      }
      checks.push(`✅ **Source Code Scan:** ${count} vulnerabilities found`);
    } else if (fs.existsSync('trivy-source-results.json')) {
      checks.push('⚠️ **Source Code Scan:** Completed (results unavailable)');
    }

    // Dockerfile scan
    const dockerfileResults = readJsonFile('trivy-dockerfile-results.json', isTrivyOutput);
    if (dockerfileResults) {
      let count = 0;
      for (const result of dockerfileResults.Results) {
        count += result.Misconfigurations?.length ?? 0;
      }
      checks.push(`✅ **Dockerfile Scan:** ${count} misconfigurations found`);
    } else if (fs.existsSync('trivy-dockerfile-results.json')) {
      checks.push('⚠️ **Dockerfile Scan:** Completed (results unavailable)');
    }

    section += checks.length > 0
      ? checks.join('  \n') + '\n\n'
      : '*Pre-build scans were not performed or results are unavailable.*\n\n';
  }

  // ---------------------------------------------------------------------------
  // Container Image Scan Results
  // ---------------------------------------------------------------------------
  if (imageScanEnabled === 'true') {
    section += '### 🐳 Container Image Vulnerabilities\n\n';

    const summary = readJsonFile('trivy-scan-summary.json', isScanSummary);

    if (summary && summary.completed) {
      // Try comparison first
      let comparisonRendered = false;

      if (comparisonEnabled === 'true') {
        const comparison = readJsonFile('trivy-comparison.json', isComparisonReport);
        if (comparison) {
          section += renderComparisonTable(comparison, summary);
          comparisonRendered = true;
        }
      }

      if (!comparisonRendered) {
        section += renderRegularVulnTable(summary);
      }

      // Vulnerability details
      section += renderVulnerabilityDetails(core);
    } else if (summary) {
      section += '*Container image scan did not complete successfully.*\n\n';
    } else {
      section += '*Container image was not scanned or results are unavailable.*\n\n';
    }
  }

  // Links
  section += '### 📊 Detailed Security Reports\n\n';
  section += `View detailed vulnerability reports in the [GitHub Security tab](${context.payload.repository.html_url}/security/code-scanning).\n\n`;

  return section;
}

// =============================================================================
// RENDER HELPERS
// =============================================================================

function renderComparisonTable(
  comparison: ComparisonReport,
  summary: ScanSummary,
): string {
  let s = '#### Vulnerability Comparison\n\n';
  s += '| Category | Critical | High | Medium | Low | Total |\n';
  s += '|----------|----------|------|--------|-----|-------|\n';
  s += `| 🆕 **New** | ${comparison.new.counts.critical} | ${comparison.new.counts.high} | ${comparison.new.counts.medium} | ${comparison.new.counts.low} | **${comparison.new.total}** |\n`;
  s += `| ✅ **Fixed** | ${comparison.fixed.counts.critical} | ${comparison.fixed.counts.high} | ${comparison.fixed.counts.medium} | ${comparison.fixed.counts.low} | **${comparison.fixed.total}** |\n`;
  s += `| 🔄 **Unchanged** | ${comparison.unchanged.counts.critical} | ${comparison.unchanged.counts.high} | ${comparison.unchanged.counts.medium} | ${comparison.unchanged.counts.low} | **${comparison.unchanged.total}** |\n`;
  s += `| 📊 **Current Total** | ${summary.critical} | ${summary.high} | ${summary.medium} | ${summary.low} | **${summary.total}** |\n\n`;

  if (comparison.new.total > 0) {
    s += `⚠️ **${comparison.new.total} new vulnerabilities** introduced in this build\n\n`;
  }
  if (comparison.fixed.total > 0) {
    s += `✅ **${comparison.fixed.total} vulnerabilities** fixed in this build\n\n`;
  }
  return s;
}

function renderRegularVulnTable(summary: ScanSummary): string {
  let s = '| Severity | Count |\n';
  s += '|----------|-------|\n';
  if (summary.critical > 0) s += `| 🔴 **Critical** | ${summary.critical} |\n`;
  if (summary.high > 0)     s += `| 🟠 **High** | ${summary.high} |\n`;
  if (summary.medium > 0)   s += `| 🟡 **Medium** | ${summary.medium} |\n`;
  if (summary.low > 0)      s += `| 🟢 **Low** | ${summary.low} |\n`;
  s += `| **Total** | **${summary.total}** |\n\n`;
  return s;
}

function renderVulnerabilityDetails(core: GitHubActionsCore): string {
  const results = readJsonFile('trivy-image-results.json', isTrivyOutput);
  if (!results) return '';

  const hasVulns = results.Results.some(
    (r) => r.Vulnerabilities && r.Vulnerabilities.length > 0,
  );
  if (!hasVulns) return '';

  let s = '<details>\n<summary>📋 View Vulnerability Details</summary>\n\n';

  for (const result of results.Results) {
    if (!result.Vulnerabilities || result.Vulnerabilities.length === 0) continue;

    s += `\n**${result.Target || 'Package'}**\n\n`;

    const vulnsToShow: Vulnerability[] = result.Vulnerabilities.slice(0, 20);

    for (const vuln of vulnsToShow) {
      const severity = vuln.Severity || 'UNKNOWN';
      const emoji = SEVERITY_EMOJI[severity] || '⚪';

      s += `- ${emoji} **${vuln.VulnerabilityID || 'UNKNOWN'}** (${severity}) - ${vuln.PkgName || 'unknown'}\n`;
      if (vuln.Title) {
        s += `  - ${vuln.Title}\n`;
      }
      if (vuln.FixedVersion) {
        s += `  - Fixed in: \`${vuln.FixedVersion}\`\n`;
      }
    }

    if (result.Vulnerabilities.length > 20) {
      s += `\n*... and ${result.Vulnerabilities.length - 20} more vulnerabilities*\n`;
    }
  }

  s += '\n</details>\n\n';
  return s;
}

// =============================================================================
// MAIN EXPORT — compatible with actions/github-script
// =============================================================================

interface ScriptArgs {
  github: GitHubClient;
  context: GitHubContext;
  core: GitHubActionsCore;
}

module.exports = async ({ github, context, core }: ScriptArgs): Promise<void> => {
  try {
    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    const buildFlowType: string = process.env.BUILD_FLOW_TYPE || 'unknown';
    const imageTags: string = process.env.IMAGE_TAGS || '';
    const registryUrls: string = process.env.REGISTRY_URLS || '';
    const customTemplate: string = process.env.PR_COMMENT_TEMPLATE || '';
    const registry: string = process.env.REGISTRY || 'both';
    const resolvedSha: string = process.env.RESOLVED_SHA || context.sha;
    const actionVersion: string = process.env.ACTION_REF || 'dev';

    core.info('📝 Generating PR comment...');
    core.debug(`Flow Type: ${buildFlowType}`);
    core.debug(`Registry: ${registry}`);

    const flow: FlowMetadata =
      FLOW_METADATA[buildFlowType as BuildFlowType] || FLOW_METADATA.wip;

    // =========================================================================
    // COMMENT GENERATION
    // =========================================================================

    let commentBody: string;

    if (customTemplate) {
      core.info('Using custom PR comment template');
      commentBody = customTemplate
        .replace(/{BUILD_FLOW}/g, buildFlowType)
        .replace(/{IMAGE_TAGS}/g, imageTags)
        .replace(/{REGISTRY_URLS}/g, registryUrls);
    } else {
      core.info('Using default PR comment template');

      const pullCommands = registryUrls.split('\n').filter((l) => l.trim());
      const pullCommandsMarkdown = pullCommands
        .map((cmd) => `\`\`\`bash\n${cmd}\n\`\`\``)
        .join('\n\n');

      const repoUrl = context.payload.repository.html_url;
      const commitSha = resolvedSha.substring(0, 7);
      const commitUrl = `${repoUrl}/commit/${resolvedSha}`;

      const registryDisplay: Record<string, string> = {
        'docker-hub': 'Docker Hub',
        ghcr: 'GitHub Container Registry',
        both: 'Docker Hub + GHCR',
      };

      const imageTagsList = imageTags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag)
        .map((tag) => `• \`${tag}\``)
        .join('<br/>');

      const securitySection = generateSecuritySection(context, core);

      commentBody = `## ${flow.emoji} Container Build Complete - ${flow.title}

**Build Status:** ✅ Success  
**Flow Type:** \`${buildFlowType}\`  
**Description:** ${flow.description}

---

### 📦 Pull Image

${pullCommandsMarkdown}

---

### 📋 Build Details

| Property | Value |
|----------|-------|
| **Flow Type** | \`${buildFlowType}\` |
| **Commit** | [\`${commitSha}\`](${commitUrl}) |
| **Registry** | ${registryDisplay[registry] || registry} |

### 🏷️ Image Tags

${imageTagsList}

---

### 🔍 Testing Your Changes

1. **Pull the image** using one of the commands above
2. **Run the container** with your test configuration
3. **Verify** the changes work as expected
4. **Report** any issues in this PR

---

### 🚀 Quick Start

\`\`\`bash
# Pull and run the container
${pullCommands[0] || 'docker pull <image>'}
docker run <your-options> <image>
\`\`\`

---
${securitySection}
---

<sub>🤖 Powered by [Container Build Flow Action](https://github.com/wgtechlabs/container-build-flow-action) v${actionVersion}  
💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏</sub>`;
    }

    // =========================================================================
    // POST COMMENT
    // =========================================================================

    let prNumber: number | null = null;

    if (context.payload.pull_request) {
      prNumber = context.payload.pull_request.number;
      core.info(`📋 PR event detected: #${prNumber}`);
    } else if (context.eventName === 'push' && context.ref) {
      const branch = context.ref.replace('refs/heads/', '');
      core.info(`🔍 Push event detected on branch: ${branch}`);
      core.info('Searching for associated pull requests...');

      try {
        const { data: prs } = await github.rest.pulls.list({
          owner: context.repo.owner,
          repo: context.repo.repo,
          state: 'open',
          head: `${context.repo.owner}:${branch}`,
        });

        if (prs.length > 0) {
          prNumber = prs[0].number;
          core.info(`✅ Found associated PR #${prNumber}`);
        } else {
          core.info('ℹ️  No open PRs found for this branch');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.warning(`Failed to search for PRs: ${message}`);
      }
    }

    if (prNumber) {
      core.info(`💬 Posting comment to PR #${prNumber}`);

      const { data: comments } = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
      });

      const botComment = comments.find(
        (comment) =>
          comment.user.type === 'Bot' &&
          comment.body.includes('Container Build Complete'),
      );

      if (botComment) {
        core.info(`🔄 Updating existing comment (ID: ${botComment.id})`);
        await github.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: botComment.id,
          body: commentBody,
        });
        core.info('✅ Comment updated successfully');
      } else {
        core.info('✨ Creating new comment');
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body: commentBody,
        });
        core.info('✅ Comment created successfully');
      }

      core.setOutput('comment-posted', 'true');
      core.info('✅ Step 3: PR comment complete!');
    } else {
      core.info('ℹ️  No associated pull request found, skipping comment');
      core.setOutput('comment-posted', 'false');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack || '' : '';
    core.setFailed(`Failed to post PR comment: ${message}`);
    core.debug(stack);
  }
};
