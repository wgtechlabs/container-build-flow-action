#!/usr/bin/env node
/**
 * Generate Vulnerability Comparison Script
 * =========================================
 * Compares vulnerability scans between baseline and current images
 * 
 * This script reads Trivy scan results for both baseline and current images,
 * identifies new, fixed, and unchanged vulnerabilities, and generates a
 * comparison report.
 * 
 * Input:
 *   - trivy-baseline-results.json: Baseline image scan results
 *   - trivy-image-results.json: Current image scan results
 * 
 * Output:
 *   - trivy-comparison.json: Comparison report with new/fixed/unchanged vulnerabilities
 */

import * as fs from 'fs';
import * as core from '@actions/core';
import type {
  TrivyScanResults,
  ProcessedVulnerability,
  VulnerabilityCounts,
  VulnerabilityComparison
} from './types';

/**
 * Extract vulnerabilities from Trivy results
 */
function extractVulnerabilities(results: TrivyScanResults): Map<string, ProcessedVulnerability> {
  const vulnerabilities = new Map<string, ProcessedVulnerability>();
  
  const trivyResults = results.Results ?? [];
  
  for (const result of trivyResults) {
    const vulns = result.Vulnerabilities ?? [];
    
    for (const vuln of vulns) {
      // Create unique key for vulnerability (CVE ID + Package)
      const vulnId = vuln.VulnerabilityID ?? 'UNKNOWN';
      const pkgName = vuln.PkgName ?? 'unknown';
      const key = `${vulnId}-${pkgName}`;
      
      vulnerabilities.set(key, {
        id: vulnId,
        package: pkgName,
        version: vuln.InstalledVersion ?? '',
        severity: (vuln.Severity ?? 'UNKNOWN').toUpperCase(),
        title: vuln.Title ?? '',
        description: vuln.Description ?? '',
        fixedVersion: vuln.FixedVersion ?? ''
      });
    }
  }
  
  return vulnerabilities;
}

/**
 * Count vulnerabilities by severity
 */
function countBySeverity(vulnerabilities: Map<string, ProcessedVulnerability>): VulnerabilityCounts {
  const counts: VulnerabilityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    total: 0
  };
  
  for (const vuln of vulnerabilities.values()) {
    const severity = vuln.severity.toLowerCase();
    
    switch (severity) {
      case 'critical':
        counts.critical++;
        break;
      case 'high':
        counts.high++;
        break;
      case 'medium':
        counts.medium++;
        break;
      case 'low':
        counts.low++;
        break;
      default:
        counts.unknown++;
    }
    counts.total++;
  }
  
  return counts;
}

/**
 * Generate comparison between baseline and current scans
 */
function generateComparison(): void {
  try {
    core.info('🔍 Generating vulnerability comparison...');
    
    // Check if required files exist
    if (!fs.existsSync('trivy-baseline-results.json')) {
      core.warning('⚠️  trivy-baseline-results.json not found, skipping comparison');
      
      const emptyComparison: VulnerabilityComparison = {
        comparison_available: false,
        message: 'Baseline scan results not available'
      };
      
      fs.writeFileSync('trivy-comparison.json', JSON.stringify(emptyComparison, null, 2));
      return;
    }
    
    if (!fs.existsSync('trivy-image-results.json')) {
      core.warning('⚠️  trivy-image-results.json not found, skipping comparison');
      
      const emptyComparison: VulnerabilityComparison = {
        comparison_available: false,
        message: 'Current scan results not available'
      };
      
      fs.writeFileSync('trivy-comparison.json', JSON.stringify(emptyComparison, null, 2));
      return;
    }
    
    // Read and parse results
    const baselineContent = fs.readFileSync('trivy-baseline-results.json', 'utf8');
    const currentContent = fs.readFileSync('trivy-image-results.json', 'utf8');
    
    const baselineResults: TrivyScanResults = JSON.parse(baselineContent);
    const currentResults: TrivyScanResults = JSON.parse(currentContent);
    
    // Extract vulnerabilities
    const baselineVulns = extractVulnerabilities(baselineResults);
    const currentVulns = extractVulnerabilities(currentResults);
    
    core.info(`  Baseline vulnerabilities: ${baselineVulns.size}`);
    core.info(`  Current vulnerabilities: ${currentVulns.size}`);
    
    // Find new vulnerabilities (in current but not in baseline)
    const newVulns = new Map<string, ProcessedVulnerability>();
    for (const [key, vuln] of currentVulns.entries()) {
      if (!baselineVulns.has(key)) {
        newVulns.set(key, vuln);
      }
    }
    
    // Find fixed vulnerabilities (in baseline but not in current)
    const fixedVulns = new Map<string, ProcessedVulnerability>();
    for (const [key, vuln] of baselineVulns.entries()) {
      if (!currentVulns.has(key)) {
        fixedVulns.set(key, vuln);
      }
    }
    
    // Find unchanged vulnerabilities (in both)
    const unchangedVulns = new Map<string, ProcessedVulnerability>();
    for (const [key, vuln] of currentVulns.entries()) {
      if (baselineVulns.has(key)) {
        unchangedVulns.set(key, vuln);
      }
    }
    
    // Count by severity
    const newCounts = countBySeverity(newVulns);
    const fixedCounts = countBySeverity(fixedVulns);
    const unchangedCounts = countBySeverity(unchangedVulns);
    
    // Create comparison report
    const comparison: VulnerabilityComparison = {
      comparison_available: true,
      baseline: {
        total: baselineVulns.size,
        vulnerabilities: Array.from(baselineVulns.values())
      },
      current: {
        total: currentVulns.size,
        vulnerabilities: Array.from(currentVulns.values())
      },
      new: {
        total: newVulns.size,
        counts: newCounts,
        vulnerabilities: Array.from(newVulns.values())
      },
      fixed: {
        total: fixedVulns.size,
        counts: fixedCounts,
        vulnerabilities: Array.from(fixedVulns.values())
      },
      unchanged: {
        total: unchangedVulns.size,
        counts: unchangedCounts,
        vulnerabilities: Array.from(unchangedVulns.values())
      }
    };
    
    // Write comparison to file
    fs.writeFileSync('trivy-comparison.json', JSON.stringify(comparison, null, 2));
    
    // Log summary
    core.info('✅ Vulnerability comparison generated:');
    core.info(`  New vulnerabilities: ${newVulns.size} (Critical: ${newCounts.critical}, High: ${newCounts.high}, Medium: ${newCounts.medium}, Low: ${newCounts.low})`);
    core.info(`  Fixed vulnerabilities: ${fixedVulns.size} (Critical: ${fixedCounts.critical}, High: ${fixedCounts.high}, Medium: ${fixedCounts.medium}, Low: ${fixedCounts.low})`);
    core.info(`  Unchanged vulnerabilities: ${unchangedVulns.size}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`❌ Failed to generate comparison: ${errorMessage}`);
    
    const errorComparison: VulnerabilityComparison = {
      comparison_available: false,
      message: `Error: ${errorMessage}`
    };
    
    fs.writeFileSync('trivy-comparison.json', JSON.stringify(errorComparison, null, 2));
    
    // Don't fail the action, just log the error
    core.warning('Continuing despite comparison error...');
  }
}

// Execute
generateComparison();
