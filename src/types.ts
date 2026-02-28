/**
 * Trivy Type Definitions
 * =======================
 * Type definitions for Trivy scan output structures.
 *
 * These types model the JSON output produced by Aqua Security's Trivy scanner.
 * Runtime validation (type guards) is provided for external data boundaries
 * (file reads / JSON.parse). Internal function signatures rely on the type
 * system alone — no redundant defensive checks.
 */

// =============================================================================
// VULNERABILITY TYPES
// =============================================================================

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface Vulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity: Severity;
  Title?: string;
  Description?: string;
}

// =============================================================================
// MISCONFIGURATION TYPES
// =============================================================================

export interface Misconfiguration {
  Type: string;
  ID: string;
  Title: string;
  Description: string;
  Severity: Severity;
  Message?: string;
  Resolution?: string;
}

// =============================================================================
// TRIVY RESULT TYPES
// =============================================================================

export interface TrivyResult {
  Target: string;
  Vulnerabilities?: Vulnerability[];
  Misconfigurations?: Misconfiguration[];
}

export interface TrivyOutput {
  Results: TrivyResult[];
}

// =============================================================================
// SCAN SUMMARY TYPES
// =============================================================================

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface ScanSummary extends SeverityCounts {
  completed: boolean;
  total: number;
}

// =============================================================================
// COMPARISON TYPES
// =============================================================================

export interface NormalizedVulnerability {
  id: string;
  package: string;
  version: string;
  severity: Severity;
  title: string;
  description: string;
  fixedVersion: string;
}

export interface ComparisonCounts extends SeverityCounts {
  total: number;
}

export interface VulnerabilitySet {
  total: number;
  counts?: ComparisonCounts;
  vulnerabilities: NormalizedVulnerability[];
}

export interface ComparisonReport {
  comparison_available: true;
  baseline: VulnerabilitySet;
  current: VulnerabilitySet;
  new: Required<VulnerabilitySet>;
  fixed: Required<VulnerabilitySet>;
  unchanged: Required<VulnerabilitySet>;
}

export interface ComparisonUnavailable {
  comparison_available: false;
  message: string;
}

export type ComparisonResult = ComparisonReport | ComparisonUnavailable;

// =============================================================================
// PR COMMENT TYPES
// =============================================================================

export interface FlowMetadata {
  emoji: string;
  title: string;
  description: string;
  color: string;
}

export type BuildFlowType = 'pr' | 'dev' | 'patch' | 'wip' | 'staging' | 'release';

export interface GitHubActionsCore {
  info(message: string): void;
  debug(message: string): void;
  warning(message: string): void;
  setFailed(message: string): void;
  setOutput(name: string, value: string): void;
}

export interface GitHubContext {
  sha: string;
  ref: string;
  eventName: string;
  repo: { owner: string; repo: string };
  payload: {
    pull_request?: { number: number };
    repository: { html_url: string };
  };
}

export interface GitHubClient {
  rest: {
    pulls: {
      list(params: {
        owner: string;
        repo: string;
        state: string;
        head: string;
      }): Promise<{ data: Array<{ number: number }> }>;
    };
    issues: {
      listComments(params: {
        owner: string;
        repo: string;
        issue_number: number;
      }): Promise<{
        data: Array<{
          id: number;
          user: { type: string };
          body: string;
        }>;
      }>;
      createComment(params: {
        owner: string;
        repo: string;
        issue_number: number;
        body: string;
      }): Promise<unknown>;
      updateComment(params: {
        owner: string;
        repo: string;
        comment_id: number;
        body: string;
      }): Promise<unknown>;
    };
  };
}

// =============================================================================
// TYPE GUARDS — Runtime validation at external data boundaries only
// =============================================================================

/**
 * Validates that a parsed JSON value conforms to TrivyOutput.
 * Use this at the boundary where untrusted JSON enters the system.
 */
export function isTrivyOutput(data: unknown): data is TrivyOutput {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.Results);
}

/**
 * Validates that a parsed JSON value conforms to ScanSummary.
 */
export function isScanSummary(data: unknown): data is ScanSummary {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.completed === 'boolean' &&
    typeof obj.total === 'number'
  );
}

/**
 * Validates that a parsed JSON value conforms to ComparisonReport.
 */
export function isComparisonReport(data: unknown): data is ComparisonReport {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return obj.comparison_available === true;
}

/**
 * Safely parse a severity string into the Severity union.
 */
export function toSeverity(value: string | undefined): Severity {
  const upper = (value ?? 'UNKNOWN').toUpperCase();
  if (upper === 'CRITICAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') {
    return upper;
  }
  return 'UNKNOWN';
}
