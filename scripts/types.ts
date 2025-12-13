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

/**
 * Trivy Vulnerability
 * Represents a single vulnerability found by Trivy scanner
 */
export interface TrivyVulnerability {
  VulnerabilityID?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
  Description?: string;
}

/**
 * Trivy Result
 * Represents scan results for a single target (image layer, file system, etc.)
 */
export interface TrivyResult {
  Target?: string;
  Class?: string;
  Type?: string;
  Vulnerabilities?: TrivyVulnerability[];
  Misconfigurations?: unknown[];
}

/**
 * Trivy Scan Results
 * Complete output structure from Trivy JSON scan
 */
export interface TrivyScanResults {
  SchemaVersion?: number;
  ArtifactName?: string;
  ArtifactType?: string;
  Metadata?: Record<string, unknown>;
  Results?: TrivyResult[];
}

/**
 * Vulnerability Count Summary
 * Aggregated vulnerability counts by severity
 */
export interface VulnerabilityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
  total: number;
}

/**
 * Vulnerability Scan Summary
 * Summary output for use in workflows
 */
export interface VulnerabilitySummary extends VulnerabilityCounts {
  completed: boolean;
}

/**
 * Processed Vulnerability
 * Standardized vulnerability format for comparison
 */
export interface ProcessedVulnerability {
  id: string;
  package: string;
  version: string;
  severity: string;
  title: string;
  description: string;
  fixedVersion: string;
}

/**
 * Vulnerability Comparison Section
 * Contains vulnerabilities and their counts
 */
export interface ComparisonSection {
  total: number;
  counts: VulnerabilityCounts;
  vulnerabilities: ProcessedVulnerability[];
}

/**
 * Vulnerability Comparison Result
 * Complete comparison between baseline and current scans
 */
export interface VulnerabilityComparison {
  comparison_available: boolean;
  message?: string;
  baseline?: {
    total: number;
    vulnerabilities: ProcessedVulnerability[];
  };
  current?: {
    total: number;
    vulnerabilities: ProcessedVulnerability[];
  };
  new?: ComparisonSection;
  fixed?: ComparisonSection;
  unchanged?: ComparisonSection;
}
