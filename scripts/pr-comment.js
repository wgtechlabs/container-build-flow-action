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
      },
      release: {
        emoji: '🎉',
        title: 'Production Release',
        description: 'Production-ready release with semantic versioning',
        color: '#6f42c1'
      }
    };
    
    const flow = flowMetadata[buildFlowType] || flowMetadata.wip;
    
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
