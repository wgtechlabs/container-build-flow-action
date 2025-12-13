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
function parseTrivyResults() {
    try {
        core.info('📊 Parsing Trivy scan results...');
        if (!fs.existsSync('trivy-image-results.json')) {
            core.warning('⚠️  trivy-image-results.json not found');
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
            core.setOutput('completed', 'false');
            core.setOutput('total', '0');
            core.setOutput('critical', '0');
            core.setOutput('high', '0');
            core.setOutput('medium', '0');
            core.setOutput('low', '0');
            return;
        }
        const resultsContent = fs.readFileSync('trivy-image-results.json', 'utf8');
        const results = JSON.parse(resultsContent);
        const counts = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            unknown: 0,
            total: 0
        };
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
        counts.total = counts.critical + counts.high + counts.medium + counts.low + counts.unknown;
        const summary = {
            completed: true,
            ...counts
        };
        fs.writeFileSync('trivy-scan-summary.json', JSON.stringify(summary, null, 2));
        core.setOutput('completed', 'true');
        core.setOutput('total', counts.total.toString());
        core.setOutput('critical', counts.critical.toString());
        core.setOutput('high', counts.high.toString());
        core.setOutput('medium', counts.medium.toString());
        core.setOutput('low', counts.low.toString());
        core.info('✅ Vulnerability scan summary:');
        core.info(`  Total: ${counts.total}`);
        core.info(`  Critical: ${counts.critical}`);
        core.info(`  High: ${counts.high}`);
        core.info(`  Medium: ${counts.medium}`);
        core.info(`  Low: ${counts.low}`);
        if (counts.unknown > 0) {
            core.info(`  Unknown: ${counts.unknown}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        core.error(`❌ Failed to parse Trivy results: ${errorMessage}`);
        core.setOutput('completed', 'false');
        core.setOutput('total', '0');
        core.setOutput('critical', '0');
        core.setOutput('high', '0');
        core.setOutput('medium', '0');
        core.setOutput('low', '0');
        core.warning('Continuing despite parse error...');
    }
}
parseTrivyResults();
//# sourceMappingURL=parse-trivy-results.js.map