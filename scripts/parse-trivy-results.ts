#!/usr/bin/env node
/**
 * Parse Trivy Results Script
 * ===========================
 * Parses Trivy scan results and generates summary with vulnerability counts
 * 
 * This script reads the Trivy JSON output, counts vulnerabilities by severity,
 * and sets GitHub Actions outputs for use in workflows and PR comments.
 * 
 * Input:
 *   - trivy-image-results.json: Trivy scan results in JSON format
 * 
 * Output:
 *   - trivy-scan-summary.json: Summary with vulnerability counts
 *   - GitHub Actions outputs: completed, total, critical, high, medium, low
 */

import * as fs from 'fs';
import * as core from '@actions/core';
import type { TrivyScanResults, VulnerabilitySummary, VulnerabilityCounts } from './types';

/**
 * Parse Trivy results and count vulnerabilities by severity
 */
function parseTrivyResults(): void {
  try {
    core.info('📊 Parsing Trivy scan results...');
    
    // Check if results file exists
    if (!fs.existsSync('trivy-image-results.json')) {
      core.warning('⚠️  trivy-image-results.json not found');
      
      // Write empty summary
      const emptySummary: VulnerabilitySummary = {
        completed: false,
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0
      };
      
      fs.writeFileSync('trivy-scan-summary.json', JSON.stringify(emptySummary, null, 2));
      
      // Set outputs
      core.setOutput('completed', 'false');
      core.setOutput('total', '0');
      core.setOutput('critical', '0');
      core.setOutput('high', '0');
      core.setOutput('medium', '0');
      core.setOutput('low', '0');
      
      return;
    }
    
    // Read and parse Trivy results
    const resultsContent = fs.readFileSync('trivy-image-results.json', 'utf8');
    const results: TrivyScanResults = JSON.parse(resultsContent);
    
    // Initialize counters
    const counts: VulnerabilityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
      total: 0
    };
    
    // Parse results based on Trivy JSON structure
    // Type system guarantees Results is defined in TrivyScanResults
    const trivyResults = results.Results ?? [];
    
    for (const result of trivyResults) {
      const vulnerabilities = result.Vulnerabilities ?? [];
      
      for (const vuln of vulnerabilities) {
        const severity = (vuln.Severity ?? 'UNKNOWN').toUpperCase();
        
        switch (severity) {
          case 'CRITICAL':
            counts.critical++;
            break;
          case 'HIGH':
            counts.high++;
            break;
          case 'MEDIUM':
            counts.medium++;
            break;
          case 'LOW':
            counts.low++;
            break;
          default:
            counts.unknown++;
        }
      }
    }
    
    // Calculate total
    counts.total = counts.critical + counts.high + counts.medium + counts.low + counts.unknown;
    
    // Create summary object
    const summary: VulnerabilitySummary = {
      completed: true,
      ...counts
    };
    
    // Write summary to file
    fs.writeFileSync('trivy-scan-summary.json', JSON.stringify(summary, null, 2));
    
    // Set GitHub Actions outputs
    core.setOutput('completed', 'true');
    core.setOutput('total', counts.total.toString());
    core.setOutput('critical', counts.critical.toString());
    core.setOutput('high', counts.high.toString());
    core.setOutput('medium', counts.medium.toString());
    core.setOutput('low', counts.low.toString());
    
    // Log summary
    core.info('✅ Vulnerability scan summary:');
    core.info(`  Total: ${counts.total}`);
    core.info(`  Critical: ${counts.critical}`);
    core.info(`  High: ${counts.high}`);
    core.info(`  Medium: ${counts.medium}`);
    core.info(`  Low: ${counts.low}`);
    
    if (counts.unknown > 0) {
      core.info(`  Unknown: ${counts.unknown}`);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.error(`❌ Failed to parse Trivy results: ${errorMessage}`);
    
    // Set error outputs
    core.setOutput('completed', 'false');
    core.setOutput('total', '0');
    core.setOutput('critical', '0');
    core.setOutput('high', '0');
    core.setOutput('medium', '0');
    core.setOutput('low', '0');
    
    // Don't fail the action, just log the error
    core.warning('Continuing despite parse error...');
  }
}

// Execute
parseTrivyResults();
