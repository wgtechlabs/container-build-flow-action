/**
 * Type Definitions for Container Build Flow Action
 * ==================================================
 * Type-safe interfaces for GitHub Actions integrations
 */

/**
 * GitHub Actions Core API
 * Provides logging and output functionality
 */
export interface ActionsCore {
  info(message: string): void;
  debug(message: string): void;
  warning(message: string): void;
  setFailed(message: string): void;
  setOutput(name: string, value: string): void;
}

/**
 * GitHub Actions Context
 * Contains workflow run context and event information
 */
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

/**
 * GitHub REST API - Pull Requests
 */
export interface PullRequest {
  number: number;
  head: {
    ref: string;
  };
}

/**
 * GitHub REST API - Issue Comment
 */
export interface IssueComment {
  id: number;
  user: {
    type: string;
  };
  body: string;
}

/**
 * GitHub API Client
 * Wrapper for GitHub REST API calls
 */
export interface GitHubAPI {
  rest: {
    pulls: {
      list(params: {
        owner: string;
        repo: string;
        state: string;
        head: string;
      }): Promise<{ data: PullRequest[] }>;
    };
    issues: {
      listComments(params: {
        owner: string;
        repo: string;
        issue_number: number;
      }): Promise<{ data: IssueComment[] }>;
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

/**
 * Main script parameters passed from actions/github-script
 */
export interface ScriptParams {
  github: GitHubAPI;
  context: ActionsContext;
  core: ActionsCore;
}

/**
 * Build Flow Types
 * Represents the different build flows supported by the action
 */
export type BuildFlowType = 'pr' | 'dev' | 'patch' | 'staging' | 'wip';

/**
 * Flow Metadata
 * Contains display information for each build flow type
 */
export interface FlowMetadata {
  emoji: string;
  title: string;
  description: string;
  color: string;
}

/**
 * Complete flow metadata mapping
 */
export type FlowMetadataMap = Record<BuildFlowType, FlowMetadata>;

/**
 * Environment variables used by the PR comment script
 */
export interface PRCommentEnv {
  BUILD_FLOW_TYPE: BuildFlowType | 'unknown';
  IMAGE_TAGS: string;
  REGISTRY_URLS: string;
  PR_COMMENT_TEMPLATE?: string;
  REGISTRY: 'docker-hub' | 'ghcr' | 'both';
  RESOLVED_SHA: string;
}
