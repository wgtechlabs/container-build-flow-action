#!/usr/bin/env node
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};

// src/generate-comparison.ts
var fs = __toESM(require("fs"));

// src/types.ts
function isTrivyOutput(data) {
  if (typeof data !== "object" || data === null)
    return false;
  const obj = data;
  return Array.isArray(obj.Results);
}
function toSeverity(value) {
  const upper = (value ?? "UNKNOWN").toUpperCase();
  if (upper === "CRITICAL" || upper === "HIGH" || upper === "MEDIUM" || upper === "LOW") {
    return upper;
  }
  return "UNKNOWN";
}

// src/generate-comparison.ts
function writeUnavailable(message) {
  const result = {
    comparison_available: false,
    message
  };
  fs.writeFileSync("trivy-comparison.json", JSON.stringify(result, null, 2));
}
function extractVulnerabilities(results) {
  const vulnerabilities = new Map;
  for (const result of results.Results) {
    if (!result.Vulnerabilities)
      continue;
    for (const vuln of result.Vulnerabilities) {
      const key = `${vuln.VulnerabilityID ?? "UNKNOWN"}-${vuln.PkgName ?? "unknown"}`;
      vulnerabilities.set(key, {
        id: vuln.VulnerabilityID ?? "UNKNOWN",
        package: vuln.PkgName ?? "unknown",
        version: vuln.InstalledVersion ?? "",
        severity: toSeverity(vuln.Severity),
        title: vuln.Title ?? "",
        description: vuln.Description ?? "",
        fixedVersion: vuln.FixedVersion ?? ""
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
      case "critical":
        counts.critical++;
        break;
      case "high":
        counts.high++;
        break;
      case "medium":
        counts.medium++;
        break;
      case "low":
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
    console.log("\uD83D\uDD0D Generating vulnerability comparison...");
    if (!fs.existsSync("trivy-baseline-results.json")) {
      console.warn("⚠️  trivy-baseline-results.json not found, skipping comparison");
      writeUnavailable("Baseline scan results not available");
      return;
    }
    if (!fs.existsSync("trivy-image-results.json")) {
      console.warn("⚠️  trivy-image-results.json not found, skipping comparison");
      writeUnavailable("Current scan results not available");
      return;
    }
    const rawBaseline = JSON.parse(fs.readFileSync("trivy-baseline-results.json", "utf8"));
    const rawCurrent = JSON.parse(fs.readFileSync("trivy-image-results.json", "utf8"));
    if (!isTrivyOutput(rawBaseline)) {
      console.warn("⚠️  Baseline Trivy output does not match expected structure");
      writeUnavailable("Baseline scan output has unexpected structure");
      return;
    }
    if (!isTrivyOutput(rawCurrent)) {
      console.warn("⚠️  Current Trivy output does not match expected structure");
      writeUnavailable("Current scan output has unexpected structure");
      return;
    }
    const baselineResults = rawBaseline;
    const currentResults = rawCurrent;
    const baselineVulns = extractVulnerabilities(baselineResults);
    const currentVulns = extractVulnerabilities(currentResults);
    console.log(`  Baseline vulnerabilities: ${baselineVulns.size}`);
    console.log(`  Current vulnerabilities: ${currentVulns.size}`);
    const newVulns = new Map;
    for (const [key, vuln] of currentVulns) {
      if (!baselineVulns.has(key))
        newVulns.set(key, vuln);
    }
    const fixedVulns = new Map;
    for (const [key, vuln] of baselineVulns) {
      if (!currentVulns.has(key))
        fixedVulns.set(key, vuln);
    }
    const unchangedVulns = new Map;
    for (const [key, vuln] of currentVulns) {
      if (baselineVulns.has(key))
        unchangedVulns.set(key, vuln);
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
    fs.writeFileSync("trivy-comparison.json", JSON.stringify(comparison, null, 2));
    console.log("✅ Vulnerability comparison generated:");
    console.log(`  New vulnerabilities: ${newVulns.size} (Critical: ${newCounts.critical}, High: ${newCounts.high}, Medium: ${newCounts.medium}, Low: ${newCounts.low})`);
    console.log(`  Fixed vulnerabilities: ${fixedVulns.size} (Critical: ${fixedCounts.critical}, High: ${fixedCounts.high}, Medium: ${fixedCounts.medium}, Low: ${fixedCounts.low})`);
    console.log(`  Unchanged vulnerabilities: ${unchangedVulns.size}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to generate comparison: ${message}`);
    writeUnavailable(`Error: ${message}`);
    console.warn("Continuing despite comparison error...");
  }
}
generateComparison();
