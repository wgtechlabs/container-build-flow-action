export interface ActionsCore {
    info(message: string): void;
    debug(message: string): void;
    warning(message: string): void;
    setFailed(message: string): void;
    setOutput(name: string, value: string): void;
}
export interface ActionsContext {
    sha: string;
    ref: string;
    eventName: string;
    repo: {
        owner: string;
        repo: string;
    };
    payload: {
        repository: {
            html_url: string;
        };
        pull_request?: {
            number: number;
            head: {
                sha: string;
            };
        };
    };
}
export interface PullRequest {
    number: number;
    head: {
        ref: string;
    };
}
export interface IssueComment {
    id: number;
    user: {
        type: string;
    };
    body: string;
}
export interface GitHubAPI {
    rest: {
        pulls: {
            list(params: {
                owner: string;
                repo: string;
                state: string;
                head: string;
            }): Promise<{
                data: PullRequest[];
            }>;
        };
        issues: {
            listComments(params: {
                owner: string;
                repo: string;
                issue_number: number;
            }): Promise<{
                data: IssueComment[];
            }>;
            createComment(params: {
                owner: string;
                repo: string;
                issue_number: number;
                body: string;
            }): Promise<void>;
            updateComment(params: {
                owner: string;
                repo: string;
                comment_id: number;
                body: string;
            }): Promise<void>;
        };
    };
}
export interface ScriptParams {
    github: GitHubAPI;
    context: ActionsContext;
    core: ActionsCore;
}
export type BuildFlowType = 'pr' | 'dev' | 'patch' | 'staging' | 'wip';
export interface FlowMetadata {
    emoji: string;
    title: string;
    description: string;
    color: string;
}
export type FlowMetadataMap = Record<BuildFlowType, FlowMetadata>;
export interface PRCommentEnv {
    BUILD_FLOW_TYPE: BuildFlowType | 'unknown';
    IMAGE_TAGS: string;
    REGISTRY_URLS: string;
    PR_COMMENT_TEMPLATE?: string;
    REGISTRY: 'docker-hub' | 'ghcr' | 'both';
    RESOLVED_SHA: string;
}
//# sourceMappingURL=types.d.ts.map