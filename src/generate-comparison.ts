#!/usr/bin/env node
/**
 * Generate Vulnerability Comparison Script
 * =========================================
 * Compares vulnerability scans between baseline and current images.
 *
 * Type safety is enforced at the JSON parse boundary via `isTrivyOutput`.
 * Internal logic operates on fully typed structures — no redundant
 * `Array.isArray()` checks (Issue #4 / Issue #9).
 *
 * Input:
 *   - trivy-baseline-results.json: Baseline image scan results
 *   - trivy-image-results.json: Current image scan results
 *
 * Output:
 *   - trivy-comparison.json: Comparison report with new/fixed/unchanged vulns
 */

import * as fs from 'fs';
import {
  ComparisonCounts,
  ComparisonResult,
  ComparisonUnavailable,
  NormalizedVulnerability,
  TrivyOutput,
  isTrivyOutput,
  toSeverity,
} from './types';

// =============================================================================
// HELPERS
// =============================================================================

function writeUnavailable(message: string): void {
  const result: ComparisonUnavailable = {
    comparison_available: false,
    message,
  };
  fs.writeFileSync('trivy-comparison.json', JSON.stringify(result, null, 2));
}

/**
 * Extract vulnerabilities from validated Trivy output into a keyed map.
 * The type system guarantees `results.Results` is an array.
 */
function extractVulnerabilities(
  results: TrivyOutput,
): Map<string, NormalizedVulnerability> {
  const vulnerabilities = new Map<string, NormalizedVulnerability>();

  for (const result of results.Results) {
    if (!result.Vulnerabilities) continue;

    for (const vuln of result.Vulnerabilities) {
      const key = `${vuln.VulnerabilityID ?? 'UNKNOWN'}-${vuln.PkgName ?? 'unknown'}`;

      vulnerabilities.set(key, {
        id: vuln.VulnerabilityID ?? 'UNKNOWN',
        package: vuln.PkgName ?? 'unknown',
        version: vuln.InstalledVersion ?? '',
        severity: toSeverity(vuln.Severity),
        title: vuln.Title ?? '',
        description: vuln.Description ?? '',
        fixedVersion: vuln.FixedVersion ?? '',
      });
    }
  }

  return vulnerabilities;
}

/**
 * Count vulnerabilities by severity.
 */
function countBySeverity(
  vulnerabilities: Map<string, NormalizedVulnerability>,
): ComparisonCounts {
  const counts: ComparisonCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    total: 0,
  };

  for (const vuln of vulnerabilities.values()) {
    const severity = vuln.severity.toLowerCase();
    switch (severity) {
      case 'critical': counts.critical++; break;
      case 'high':     counts.high++;     break;
      case 'medium':   counts.medium++;   break;
      case 'low':      counts.low++;      break;
      default:         counts.unknown++;
    }
    counts.total++;
  }

  return counts;
}

// =============================================================================
// MAIN
// =============================================================================

function generateComparison(): void {
  try {
    console.log('🔍 Generating vulnerability comparison...');

    if (!fs.existsSync('trivy-baseline-results.json')) {
      console.warn('⚠️  trivy-baseline-results.json not found, skipping comparison');
      writeUnavailable('Baseline scan results not available');
      return;
    }

    if (!fs.existsSync('trivy-image-results.json')) {
      console.warn('⚠️  trivy-image-results.json not found, skipping comparison');
      writeUnavailable('Current scan results not available');
      return;
    }

    // Parse and validate at the boundary
    const rawBaseline: unknown = JSON.parse(
      fs.readFileSync('trivy-baseline-results.json', 'utf8'),
    );
    const rawCurrent: unknown = JSON.parse(
      fs.readFileSync('trivy-image-results.json', 'utf8'),
    );

    if (!isTrivyOutput(rawBaseline)) {
      console.warn('⚠️  Baseline Trivy output does not match expected structure');
      writeUnavailable('Baseline scan output has unexpected structure');
      return;
    }

    if (!isTrivyOutput(rawCurrent)) {
      console.warn('⚠️  Current Trivy output does not match expected structure');
      writeUnavailable('Current scan output has unexpected structure');
      return;
    }

    const baselineResults: TrivyOutput = rawBaseline;
    const currentResults: TrivyOutput = rawCurrent;

    // Typed maps — no defensive checks needed downstream
    const baselineVulns = extractVulnerabilities(baselineResults);
    const currentVulns = extractVulnerabilities(currentResults);

    console.log(`  Baseline vulnerabilities: ${baselineVulns.size}`);
    console.log(`  Current vulnerabilities: ${currentVulns.size}`);

    // New: in current but not in baseline
    const newVulns = new Map<string, NormalizedVulnerability>();
    for (const [key, vuln] of currentVulns) {
      if (!baselineVulns.has(key)) newVulns.set(key, vuln);
    }

    // Fixed: in baseline but not in current
    const fixedVulns = new Map<string, NormalizedVulnerability>();
    for (const [key, vuln] of baselineVulns) {
      if (!currentVulns.has(key)) fixedVulns.set(key, vuln);
    }

    // Unchanged: in both
    const unchangedVulns = new Map<string, NormalizedVulnerability>();
    for (const [key, vuln] of currentVulns) {
      if (baselineVulns.has(key)) unchangedVulns.set(key, vuln);
    }

    const newCounts = countBySeverity(newVulns);
    const fixedCounts = countBySeverity(fixedVulns);
    const unchangedCounts = countBySeverity(unchangedVulns);

    const comparison: ComparisonResult = {
      comparison_available: true,
      baseline: {
        total: baselineVulns.size,
        vulnerabilities: Array.from(baselineVulns.values()),
      },
      current: {
        total: currentVulns.size,
        vulnerabilities: Array.from(currentVulns.values()),
      },
      new: {
        total: newVulns.size,
        counts: newCounts,
        vulnerabilities: Array.from(newVulns.values()),
      },
      fixed: {
        total: fixedVulns.size,
        counts: fixedCounts,
        vulnerabilities: Array.from(fixedVulns.values()),
      },
      unchanged: {
        total: unchangedVulns.size,
        counts: unchangedCounts,
        vulnerabilities: Array.from(unchangedVulns.values()),
      },
    };

    fs.writeFileSync('trivy-comparison.json', JSON.stringify(comparison, null, 2));

    console.log('✅ Vulnerability comparison generated:');
    console.log(
      `  New vulnerabilities: ${newVulns.size} (Critical: ${newCounts.critical}, High: ${newCounts.high}, Medium: ${newCounts.medium}, Low: ${newCounts.low})`,
    );
    console.log(
      `  Fixed vulnerabilities: ${fixedVulns.size} (Critical: ${fixedCounts.critical}, High: ${fixedCounts.high}, Medium: ${fixedCounts.medium}, Low: ${fixedCounts.low})`,
    );
    console.log(`  Unchanged vulnerabilities: ${unchangedVulns.size}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to generate comparison: ${message}`);

    writeUnavailable(`Error: ${message}`);

    console.warn('Continuing despite comparison error...');
  }
}

generateComparison();
