#!/usr/bin/env node
/**
 * PR Comment Script - Phase 4 Implementation
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
 *   BUILD_FLOW_TYPE      : Detected flow (pr, dev, patch, wip)
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
        emoji: '🚀',
        title: 'Dev Build',
        description: 'Staging/pre-production validation',
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
      latest: {
        emoji: '✨',
        title: 'Latest Build',
        description: 'Production release',
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
      const commitSha = context.sha.substring(0, 7);
      const commitUrl = `${repoUrl}/commit/${context.sha}`;
      
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
| **Registry** | \`${registry}\` |
| **Image Tags** | \`${imageTags}\` |

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

<sub>🤖 Automated comment by [Container Build Flow Action](https://github.com/wgtechlabs/container-build-flow-action)</sub>`;
    }
    
    // =============================================================================
    // POST COMMENT
    // =============================================================================
    
    if (context.payload.pull_request) {
      const prNumber = context.payload.pull_request.number;
      
      core.info(`Posting comment to PR #${prNumber}`);
      
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
        core.info(`Updating existing comment (ID: ${botComment.id})`);
        await github.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: botComment.id,
          body: commentBody,
        });
        core.info('✅ Comment updated successfully');
      } else {
        // Create new comment
        core.info('Creating new comment');
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: prNumber,
          body: commentBody,
        });
        core.info('✅ Comment created successfully');
      }
      
      core.setOutput('comment-posted', 'true');
    } else {
      core.warning('⚠️  Not a pull request event, skipping comment');
      core.setOutput('comment-posted', 'false');
    }
    
  } catch (error) {
    core.setFailed(`Failed to post PR comment: ${error.message}`);
    core.debug(error.stack);
  }
};
