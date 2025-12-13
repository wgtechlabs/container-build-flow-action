#!/usr/bin/env node
/**
 * PR Comment Script - Step 3 Implementation
 * ===========================================
 * Generates and posts formatted PR comments with docker pull instructions
 * 
 * This script creates helpful comments on pull requests with:
 * - Build flow information
 * - Docker pull commands for easy testing
 * - Registry-specific instructions
 * - Build metadata and links
 * 
 * Environment Variables:
 *   BUILD_FLOW_TYPE      : Detected flow (pr, dev, patch, staging, wip)
 *   IMAGE_TAGS           : Comma-separated image tags
 *   REGISTRY_URLS        : Registry pull commands
 *   PR_COMMENT_TEMPLATE  : Optional custom template
 *   REGISTRY             : Target registry config
 */

module.exports = async ({github, context, core}) => {
  try {
    // =============================================================================
    // CONFIGURATION
    // =============================================================================
    
    const buildFlowType = process.env.BUILD_FLOW_TYPE || 'unknown';
    const imageTags = process.env.IMAGE_TAGS || '';
    const registryUrls = process.env.REGISTRY_URLS || '';
    const customTemplate = process.env.PR_COMMENT_TEMPLATE || '';
    const registry = process.env.REGISTRY || 'both';
    const resolvedSha = process.env.RESOLVED_SHA || context.sha;
    
    // Security scanning environment variables
    const vulnerabilityCommentEnabled = process.env.VULNERABILITY_COMMENT_ENABLED || 'true';
    const preBuildScanEnabled = process.env.PRE_BUILD_SCAN_ENABLED || 'true';
    const imageScanEnabled = process.env.IMAGE_SCAN_ENABLED || 'true';
    const comparisonEnabled = process.env.ENABLE_IMAGE_COMPARISON || 'false';
    
    core.info('📝 Generating PR comment...');
    core.debug(`Flow Type: ${buildFlowType}`);
    core.debug(`Registry: ${registry}`);
    
    // =============================================================================
    // FLOW TYPE METADATA
    // =============================================================================
    
    const flowMetadata = {
      pr: {
        emoji: '🔧',
        title: 'PR Build',
        description: 'Feature development and testing',
        color: '#0366d6'
      },
      dev: {
        emoji: '🛠️',
        title: 'Dev Build',
        description: 'Development and testing',
        color: '#28a745'
      },
      patch: {
        emoji: '🔥',
        title: 'Patch Build',
        description: 'Hotfix for production',
        color: '#d73a49'
      },
      wip: {
        emoji: '⚡',
        title: 'WIP Build',
        description: 'Work in progress experiment',
        color: '#ffd33d'
      },
      staging: {
        emoji: '🚀',
        title: 'Staging Build',
        description: 'Pre-production validation',
        color: '#ffd700'
      }
    };
    
    const flow = flowMetadata[buildFlowType] || flowMetadata.wip;
    
    // =============================================================================
    // SECURITY SCANNING SECTION GENERATION
    // =============================================================================
    
    const generateSecuritySection = () => {
      // Check if security scanning is disabled
      if (vulnerabilityCommentEnabled !== 'true') {
        return '';
      }
      
      const fs = require('fs');
      let securitySection = '\n---\n\n## 🔒 Security Scan Results\n\n';
      
      // Pre-build scan results
      if (preBuildScanEnabled === 'true') {
        securitySection += '### 📋 Pre-Build Security Checks\n\n';
        
        let preBuildChecks = [];
        
        // Check source code scan results
        if (fs.existsSync('trivy-source-results.json')) {
          try {
            const sourceResults = JSON.parse(fs.readFileSync('trivy-source-results.json', 'utf8'));
            let sourceVulnCount = 0;
            const sourceVulnerabilities = Array.isArray(sourceResults.Results) ? sourceResults.Results : [];
            sourceVulnerabilities.forEach(result => {
              if (result.Vulnerabilities) {
                sourceVulnCount += result.Vulnerabilities.length;
              }
            });
            preBuildChecks.push(`✅ **Source Code Scan:** ${sourceVulnCount} vulnerabilities found`);
          } catch (e) {
            preBuildChecks.push('⚠️ **Source Code Scan:** Completed (results unavailable)');
          }
        }
        
        // Check Dockerfile scan results
        if (fs.existsSync('trivy-dockerfile-results.json')) {
          try {
            const dockerfileResults = JSON.parse(fs.readFileSync('trivy-dockerfile-results.json', 'utf8'));
            let dockerfileIssues = 0;
            const dockerfileMisconfigurations = Array.isArray(dockerfileResults.Results) ? dockerfileResults.Results : [];
            dockerfileMisconfigurations.forEach(result => {
              if (result.Misconfigurations) {
                dockerfileIssues += result.Misconfigurations.length;
              }
            });
            preBuildChecks.push(`✅ **Dockerfile Scan:** ${dockerfileIssues} misconfigurations found`);
          } catch (e) {
            preBuildChecks.push('⚠️ **Dockerfile Scan:** Completed (results unavailable)');
          }
        }
        
        if (preBuildChecks.length > 0) {
          securitySection += preBuildChecks.join('  \n') + '\n\n';
        } else {
          securitySection += '*Pre-build scans were not performed or results are unavailable.*\n\n';
        }
      }
      
      // Container image scan results
      if (imageScanEnabled === 'true') {
        securitySection += '### 🐳 Container Image Vulnerabilities\n\n';
        
        // Check if scan summary exists
        if (fs.existsSync('trivy-scan-summary.json')) {
          try {
            const summary = JSON.parse(fs.readFileSync('trivy-scan-summary.json', 'utf8'));
            
            if (summary.completed) {
              // Check if comparison is enabled and available
              if (comparisonEnabled === 'true' && fs.existsSync('trivy-comparison.json')) {
                try {
                  const comparison = JSON.parse(fs.readFileSync('trivy-comparison.json', 'utf8'));
                  
                  if (comparison.comparison_available) {
                    // Show comparison table
                    securitySection += '#### Vulnerability Comparison\n\n';
                    securitySection += '| Category | Critical | High | Medium | Low | Total |\n';
                    securitySection += '|----------|----------|------|--------|-----|-------|\n';
                    securitySection += `| 🆕 **New** | ${comparison.new.counts.critical} | ${comparison.new.counts.high} | ${comparison.new.counts.medium} | ${comparison.new.counts.low} | **${comparison.new.total}** |\n`;
                    securitySection += `| ✅ **Fixed** | ${comparison.fixed.counts.critical} | ${comparison.fixed.counts.high} | ${comparison.fixed.counts.medium} | ${comparison.fixed.counts.low} | **${comparison.fixed.total}** |\n`;
                    securitySection += `| 🔄 **Unchanged** | ${comparison.unchanged.counts.critical} | ${comparison.unchanged.counts.high} | ${comparison.unchanged.counts.medium} | ${comparison.unchanged.counts.low} | **${comparison.unchanged.total}** |\n`;
                    securitySection += `| 📊 **Current Total** | ${summary.critical} | ${summary.high} | ${summary.medium} | ${summary.low} | **${summary.total}** |\n\n`;
                    
                    // Add comparison insights
                    if (comparison.new.total > 0) {
                      securitySection += `⚠️ **${comparison.new.total} new vulnerabilities** introduced in this build\n\n`;
                    }
                    if (comparison.fixed.total > 0) {
                      securitySection += `✅ **${comparison.fixed.total} vulnerabilities** fixed in this build\n\n`;
                    }
                  } else {
                    // Comparison not available, show regular table
                    showRegularVulnTable();
                  }
                } catch (e) {
                  showRegularVulnTable();
                }
              } else {
                // No comparison, show regular vulnerability table
                showRegularVulnTable();
              }
              
              function showRegularVulnTable() {
                securitySection += '| Severity | Count |\n';
                securitySection += '|----------|-------|\n';
                if (summary.critical > 0) {
                  securitySection += `| 🔴 **Critical** | ${summary.critical} |\n`;
                }
                if (summary.high > 0) {
                  securitySection += `| 🟠 **High** | ${summary.high} |\n`;
                }
                if (summary.medium > 0) {
                  securitySection += `| 🟡 **Medium** | ${summary.medium} |\n`;
                }
                if (summary.low > 0) {
                  securitySection += `| 🟢 **Low** | ${summary.low} |\n`;
                }
                securitySection += `| **Total** | **${summary.total}** |\n\n`;
              }
              
              // Add details section with vulnerability list
              if (summary.total > 0 && fs.existsSync('trivy-image-results.json')) {
                try {
                  const results = JSON.parse(fs.readFileSync('trivy-image-results.json', 'utf8'));

                  securitySection += '<details>\n<summary>📋 View Vulnerability Details</summary>\n\n';

                  const imageResults = Array.isArray(results.Results) ? results.Results : [];
                  imageResults.forEach((result, idx) => {
                      if (result.Vulnerabilities && result.Vulnerabilities.length > 0) {
                        securitySection += `\n**${result.Target || 'Package'}**\n\n`;
                        
                        // Limit to first 20 vulnerabilities to avoid huge comments
                        const vulnsToShow = result.Vulnerabilities.slice(0, 20);
                        
                        vulnsToShow.forEach(vuln => {
                          const severity = vuln.Severity || 'UNKNOWN';
                          const severityEmoji = {
                            'CRITICAL': '🔴',
                            'HIGH': '🟠',
                            'MEDIUM': '🟡',
                            'LOW': '🟢',
                            'UNKNOWN': '⚪'
                          }[severity] || '⚪';
                          
                          securitySection += `- ${severityEmoji} **${vuln.VulnerabilityID || 'UNKNOWN'}** (${severity}) - ${vuln.PkgName || 'unknown'}\n`;
                          if (vuln.Title) {
                            securitySection += `  - ${vuln.Title}\n`;
                          }
                          if (vuln.FixedVersion) {
                            securitySection += `  - Fixed in: \`${vuln.FixedVersion}\`\n`;
                          }
                        });
                        
                        if (result.Vulnerabilities.length > 20) {
                          securitySection += `\n*... and ${result.Vulnerabilities.length - 20} more vulnerabilities*\n`;
                        }
                      }
                    });
                  }
                  
                  securitySection += '\n</details>\n\n';
                } catch (e) {
                  core.debug(`Could not parse vulnerability details: ${e.message}`);
                }
              }
            } else {
              securitySection += '*Container image scan did not complete successfully.*\n\n';
            }
          } catch (e) {
            securitySection += '*Scan results are unavailable.*\n\n';
          }
        } else {
          securitySection += '*Container image was not scanned or results are unavailable.*\n\n';
        }
      }
      
      // Links to GitHub Security tab
      securitySection += '### 📊 Detailed Security Reports\n\n';
      securitySection += `View detailed vulnerability reports in the [GitHub Security tab](${context.payload.repository.html_url}/security/code-scanning).\n\n`;
      
      return securitySection;
    };
    
    // =============================================================================
    // COMMENT GENERATION
    // =============================================================================
    
    let commentBody;
    
    if (customTemplate) {
      // Use custom template with variable substitution
      core.info('Using custom PR comment template');
      commentBody = customTemplate
        .replace(/{BUILD_FLOW}/g, buildFlowType)
        .replace(/{IMAGE_TAGS}/g, imageTags)
        .replace(/{REGISTRY_URLS}/g, registryUrls);
    } else {
      // Generate default comment
      core.info('Using default PR comment template');
      
      // Parse registry URLs for display
      const pullCommands = registryUrls.split('\n').filter(line => line.trim());
      const pullCommandsMarkdown = pullCommands.map(cmd => `\`\`\`bash\n${cmd}\n\`\`\``).join('\n\n');
      
      // Get repository information
      const repoUrl = `${context.payload.repository.html_url}`;
      const commitSha = resolvedSha.substring(0, 7);
      const commitUrl = `${repoUrl}/commit/${resolvedSha}`;
      
      // Format registry display
      const registryDisplay = {
        'docker-hub': 'Docker Hub',
        'ghcr': 'GitHub Container Registry',
        'both': 'Docker Hub + GHCR'
      }[registry] || registry;
      
      // Format image tags for better readability
      const imageTagsList = imageTags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag)
        .map(tag => `• \`${tag}\``)
        .join('<br/>');
      
      // Generate security section
      const securitySection = generateSecuritySection();
      
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
| **Registry** | ${registryDisplay} |

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

<sub>🤖 Powered by [Container Build Flow Action](https://github.com/wgtechlabs/container-build-flow-action)  
💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏</sub>`;
    }
    
    // =============================================================================
    // POST COMMENT
    // =============================================================================
    
    let prNumber = null;
    
    // For pull_request events, use the PR from payload
    if (context.payload.pull_request) {
      prNumber = context.payload.pull_request.number;
      core.info(`📋 PR event detected: #${prNumber}`);
    } 
    // For push events, search for open PRs with this branch as head
    else if (context.eventName === 'push' && context.ref) {
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
        core.warning(`Failed to search for PRs: ${error.message}`);
      }
    }
    
    if (prNumber) {
      
      core.info(`💬 Posting comment to PR #${prNumber}`);
      
      // Check if we already posted a comment
      const { data: comments } = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
      });
      
      // Find existing comment from this action
      const botComment = comments.find(comment => 
        comment.user.type === 'Bot' && 
        comment.body.includes('Container Build Complete')
      );
      
      if (botComment) {
        // Update existing comment
        core.info(`🔄 Updating existing comment (ID: ${botComment.id})`);
        await github.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: botComment.id,
          body: commentBody,
        });
        core.info('✅ Comment updated successfully');
      } else {
        // Create new comment
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
    core.setFailed(`Failed to post PR comment: ${error.message}`);
    core.debug(error.stack);
  }
};
