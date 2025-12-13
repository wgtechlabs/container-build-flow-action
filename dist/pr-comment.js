#!/usr/bin/env node
"use strict";
function getEnv(key, defaultValue = '') {
    return process.env[key] ?? defaultValue;
}
module.exports = async ({ github, context, core }) => {
    try {
        const buildFlowType = getEnv('BUILD_FLOW_TYPE', 'unknown');
        const imageTags = getEnv('IMAGE_TAGS');
        const registryUrls = getEnv('REGISTRY_URLS');
        const customTemplate = getEnv('PR_COMMENT_TEMPLATE');
        const registry = getEnv('REGISTRY', 'both');
        const resolvedSha = getEnv('RESOLVED_SHA', context.sha);
        core.info('📝 Generating PR comment...');
        core.debug(`Flow Type: ${buildFlowType}`);
        core.debug(`Registry: ${registry}`);
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
        const flow = buildFlowType !== 'unknown'
            ? flowMetadata[buildFlowType]
            : flowMetadata.wip;
        let commentBody;
        if (customTemplate) {
            core.info('Using custom PR comment template');
            commentBody = customTemplate
                .replace(/{BUILD_FLOW}/g, buildFlowType)
                .replace(/{IMAGE_TAGS}/g, imageTags)
                .replace(/{REGISTRY_URLS}/g, registryUrls);
        }
        else {
            core.info('Using default PR comment template');
            const pullCommands = registryUrls.split('\n').filter(line => line.trim());
            const pullCommandsMarkdown = pullCommands.map(cmd => `\`\`\`bash\n${cmd}\n\`\`\``).join('\n\n');
            const repoUrl = context.payload.repository.html_url;
            const commitSha = resolvedSha.substring(0, 7);
            const commitUrl = `${repoUrl}/commit/${resolvedSha}`;
            const registryDisplayMap = {
                'docker-hub': 'Docker Hub',
                'ghcr': 'GitHub Container Registry',
                'both': 'Docker Hub + GHCR'
            };
            const registryDisplay = registryDisplayMap[registry] ?? registry;
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
${pullCommands[0] ?? 'docker pull <image>'}
docker run <your-options> <image>
\`\`\`

---

<sub>🤖 Powered by [Container Build Flow Action](https://github.com/wgtechlabs/container-build-flow-action)  
💻 with ❤️ by [Waren Gonzaga](https://warengonzaga.com) under [WG Technology Labs](https://wgtechlabs.com), and [Him](https://www.youtube.com/watch?v=HHrxS4diLew&t=44s) 🙏</sub>`;
        }
        let prNumber = null;
        if (context.payload.pull_request) {
            prNumber = context.payload.pull_request.number;
            core.info(`📋 PR event detected: #${prNumber}`);
        }
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
                if (prs.length > 0 && prs[0]) {
                    prNumber = prs[0].number;
                    core.info(`✅ Found associated PR #${prNumber}`);
                }
                else {
                    core.info('ℹ️  No open PRs found for this branch');
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                core.warning(`Failed to search for PRs: ${errorMessage}`);
            }
        }
        if (prNumber) {
            core.info(`💬 Posting comment to PR #${prNumber}`);
            const { data: comments } = await github.rest.issues.listComments({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prNumber,
            });
            const botComment = comments.find(comment => comment.user.type === 'Bot' &&
                comment.body.includes('Container Build Complete'));
            if (botComment) {
                core.info(`🔄 Updating existing comment (ID: ${botComment.id})`);
                await github.rest.issues.updateComment({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    comment_id: botComment.id,
                    body: commentBody,
                });
                core.info('✅ Comment updated successfully');
            }
            else {
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
        }
        else {
            core.info('ℹ️  No associated pull request found, skipping comment');
            core.setOutput('comment-posted', 'false');
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? (error.stack ?? '') : '';
        core.setFailed(`Failed to post PR comment: ${errorMessage}`);
        if (errorStack) {
            core.debug(errorStack);
        }
    }
};
//# sourceMappingURL=pr-comment.js.map