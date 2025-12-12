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

const fs = require('fs');
const core = require('@actions/core');

/**
 * Parse Trivy results and count vulnerabilities by severity
 */
function parseTrivyResults() {
  try {
    core.info('📊 Parsing Trivy scan results...');
    
    // Check if results file exists
    if (!fs.existsSync('trivy-image-results.json')) {
      core.warning('⚠️  trivy-image-results.json not found');
      
      // Write empty summary
      const emptySummary = {
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
    const results = JSON.parse(resultsContent);
    
    // Initialize counters
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0
    };
    
    // Parse results based on Trivy JSON structure
    if (results.Results && Array.isArray(results.Results)) {
      results.Results.forEach(result => {
        if (result.Vulnerabilities && Array.isArray(result.Vulnerabilities)) {
          result.Vulnerabilities.forEach(vuln => {
            const severity = (vuln.Severity || 'UNKNOWN').toUpperCase();
            
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
          });
        }
      });
    }
    
    // Calculate total
    const total = counts.critical + counts.high + counts.medium + counts.low + counts.unknown;
    
    // Create summary object
    const summary = {
      completed: true,
      total: total,
      critical: counts.critical,
      high: counts.high,
      medium: counts.medium,
      low: counts.low,
      unknown: counts.unknown
    };
    
    // Write summary to file
    fs.writeFileSync('trivy-scan-summary.json', JSON.stringify(summary, null, 2));
    
    // Set GitHub Actions outputs
    core.setOutput('completed', 'true');
    core.setOutput('total', total.toString());
    core.setOutput('critical', counts.critical.toString());
    core.setOutput('high', counts.high.toString());
    core.setOutput('medium', counts.medium.toString());
    core.setOutput('low', counts.low.toString());
    
    // Log summary
    core.info('✅ Vulnerability scan summary:');
    core.info(`  Total: ${total}`);
    core.info(`  Critical: ${counts.critical}`);
    core.info(`  High: ${counts.high}`);
    core.info(`  Medium: ${counts.medium}`);
    core.info(`  Low: ${counts.low}`);
    
    if (counts.unknown > 0) {
      core.info(`  Unknown: ${counts.unknown}`);
    }
    
  } catch (error) {
    core.error(`❌ Failed to parse Trivy results: ${error.message}`);
    
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
