#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const core = __importStar(require("@actions/core"));
function extractVulnerabilities(results) {
    const vulnerabilities = new Map();
    const trivyResults = results.Results ?? [];
    for (const result of trivyResults) {
        const vulns = result.Vulnerabilities ?? [];
        for (const vuln of vulns) {
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
function countBySeverity(vulnerabilities) {
    const counts = {
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
function generateComparison() {
    try {
        core.info('🔍 Generating vulnerability comparison...');
        if (!fs.existsSync('trivy-baseline-results.json')) {
            core.warning('⚠️  trivy-baseline-results.json not found, skipping comparison');
            const emptyComparison = {
                comparison_available: false,
                message: 'Baseline scan results not available'
            };
            fs.writeFileSync('trivy-comparison.json', JSON.stringify(emptyComparison, null, 2));
            return;
        }
        if (!fs.existsSync('trivy-image-results.json')) {
            core.warning('⚠️  trivy-image-results.json not found, skipping comparison');
            const emptyComparison = {
                comparison_available: false,
                message: 'Current scan results not available'
            };
            fs.writeFileSync('trivy-comparison.json', JSON.stringify(emptyComparison, null, 2));
            return;
        }
        const baselineContent = fs.readFileSync('trivy-baseline-results.json', 'utf8');
        const currentContent = fs.readFileSync('trivy-image-results.json', 'utf8');
        const baselineResults = JSON.parse(baselineContent);
        const currentResults = JSON.parse(currentContent);
        const baselineVulns = extractVulnerabilities(baselineResults);
        const currentVulns = extractVulnerabilities(currentResults);
        core.info(`  Baseline vulnerabilities: ${baselineVulns.size}`);
        core.info(`  Current vulnerabilities: ${currentVulns.size}`);
        const newVulns = new Map();
        for (const [key, vuln] of currentVulns.entries()) {
            if (!baselineVulns.has(key)) {
                newVulns.set(key, vuln);
            }
        }
        const fixedVulns = new Map();
        for (const [key, vuln] of baselineVulns.entries()) {
            if (!currentVulns.has(key)) {
                fixedVulns.set(key, vuln);
            }
        }
        const unchangedVulns = new Map();
        for (const [key, vuln] of currentVulns.entries()) {
            if (baselineVulns.has(key)) {
                unchangedVulns.set(key, vuln);
            }
        }
        const newCounts = countBySeverity(newVulns);
        const fixedCounts = countBySeverity(fixedVulns);
        const unchangedCounts = countBySeverity(unchangedVulns);
        const comparison = {
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
        fs.writeFileSync('trivy-comparison.json', JSON.stringify(comparison, null, 2));
        core.info('✅ Vulnerability comparison generated:');
        core.info(`  New vulnerabilities: ${newVulns.size} (Critical: ${newCounts.critical}, High: ${newCounts.high}, Medium: ${newCounts.medium}, Low: ${newCounts.low})`);
        core.info(`  Fixed vulnerabilities: ${fixedVulns.size} (Critical: ${fixedCounts.critical}, High: ${fixedCounts.high}, Medium: ${fixedCounts.medium}, Low: ${fixedCounts.low})`);
        core.info(`  Unchanged vulnerabilities: ${unchangedVulns.size}`);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.error(`❌ Failed to generate comparison: ${errorMessage}`);
        const errorComparison = {
            comparison_available: false,
            message: `Error: ${errorMessage}`
        };
        fs.writeFileSync('trivy-comparison.json', JSON.stringify(errorComparison, null, 2));
        core.warning('Continuing despite comparison error...');
    }
}
generateComparison();
//# sourceMappingURL=generate-comparison.js.map