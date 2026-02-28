#!/usr/bin/env node
/**
 * Parse Trivy Results Script
 * ===========================
 * Parses Trivy scan results and generates summary with vulnerability counts.
 *
 * Type safety is enforced at the JSON parse boundary via `isTrivyOutput`,
 * eliminating the need for repeated `Array.isArray()` defensive checks inside
 * business logic (see Issue #4 / Issue #9).
 *
 * Input:
 *   - trivy-image-results.json: Trivy scan results in JSON format
 *
 * Output:
 *   - trivy-scan-summary.json: Summary with vulnerability counts
 *   - GitHub Actions outputs: completed, total, critical, high, medium, low
 */

import * as fs from 'fs';
import {
  ScanSummary,
  SeverityCounts,
  TrivyOutput,
  isTrivyOutput,
  toSeverity,
} from './types';

// =============================================================================
// HELPERS
// =============================================================================

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }
}

function writeEmptySummary(): void {
  const empty: ScanSummary = {
    completed: false,
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };

  fs.writeFileSync('trivy-scan-summary.json', JSON.stringify(empty, null, 2));

  setOutput('completed', 'false');
  setOutput('total', '0');
  setOutput('critical', '0');
  setOutput('high', '0');
  setOutput('medium', '0');
  setOutput('low', '0');
}

// =============================================================================
// MAIN
// =============================================================================

function parseTrivyResults(): void {
  try {
    console.log('📊 Parsing Trivy scan results...');

    if (!fs.existsSync('trivy-image-results.json')) {
      console.warn('⚠️  trivy-image-results.json not found');
      writeEmptySummary();
      return;
    }

    const raw: unknown = JSON.parse(
      fs.readFileSync('trivy-image-results.json', 'utf8'),
    );

    // Runtime validation at external data boundary
    if (!isTrivyOutput(raw)) {
      console.warn('⚠️  Trivy output does not match expected structure');
      writeEmptySummary();
      return;
    }

    // After the type guard, `results` is fully typed — no more defensive checks
    const results: TrivyOutput = raw;

    const counts: SeverityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
    };

    for (const result of results.Results) {
      if (!result.Vulnerabilities) continue;

      for (const vuln of result.Vulnerabilities) {
        const severity = toSeverity(vuln.Severity);
        switch (severity) {
          case 'CRITICAL': counts.critical++; break;
          case 'HIGH':     counts.high++;     break;
          case 'MEDIUM':   counts.medium++;   break;
          case 'LOW':      counts.low++;      break;
          default:         counts.unknown++;
        }
      }
    }

    const total =
      counts.critical + counts.high + counts.medium + counts.low + counts.unknown;

    const summary: ScanSummary = {
      completed: true,
      total,
      ...counts,
    };

    fs.writeFileSync('trivy-scan-summary.json', JSON.stringify(summary, null, 2));

    setOutput('completed', 'true');
    setOutput('total', total.toString());
    setOutput('critical', counts.critical.toString());
    setOutput('high', counts.high.toString());
    setOutput('medium', counts.medium.toString());
    setOutput('low', counts.low.toString());

    console.log('✅ Vulnerability scan summary:');
    console.log(`  Total: ${total}`);
    console.log(`  Critical: ${counts.critical}`);
    console.log(`  High: ${counts.high}`);
    console.log(`  Medium: ${counts.medium}`);
    console.log(`  Low: ${counts.low}`);

    if (counts.unknown > 0) {
      console.log(`  Unknown: ${counts.unknown}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to parse Trivy results: ${message}`);

    writeEmptySummary();

    console.warn('Continuing despite parse error...');
  }
}

parseTrivyResults();
