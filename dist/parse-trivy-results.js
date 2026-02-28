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

// src/parse-trivy-results.ts
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

// src/parse-trivy-results.ts
function setOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}
`);
  }
}
function writeEmptySummary() {
  const empty = {
    completed: false,
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0
  };
  fs.writeFileSync("trivy-scan-summary.json", JSON.stringify(empty, null, 2));
  setOutput("completed", "false");
  setOutput("total", "0");
  setOutput("critical", "0");
  setOutput("high", "0");
  setOutput("medium", "0");
  setOutput("low", "0");
}
function parseTrivyResults() {
  try {
    console.log("\uD83D\uDCCA Parsing Trivy scan results...");
    if (!fs.existsSync("trivy-image-results.json")) {
      console.warn("⚠️  trivy-image-results.json not found");
      writeEmptySummary();
      return;
    }
    const raw = JSON.parse(fs.readFileSync("trivy-image-results.json", "utf8"));
    if (!isTrivyOutput(raw)) {
      console.warn("⚠️  Trivy output does not match expected structure");
      writeEmptySummary();
      return;
    }
    const results = raw;
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0
    };
    for (const result of results.Results) {
      if (!result.Vulnerabilities)
        continue;
      for (const vuln of result.Vulnerabilities) {
        const severity = toSeverity(vuln.Severity);
        switch (severity) {
          case "CRITICAL":
            counts.critical++;
            break;
          case "HIGH":
            counts.high++;
            break;
          case "MEDIUM":
            counts.medium++;
            break;
          case "LOW":
            counts.low++;
            break;
          default:
            counts.unknown++;
        }
      }
    }
    const total = counts.critical + counts.high + counts.medium + counts.low + counts.unknown;
    const summary = {
      completed: true,
      total,
      ...counts
    };
    fs.writeFileSync("trivy-scan-summary.json", JSON.stringify(summary, null, 2));
    setOutput("completed", "true");
    setOutput("total", total.toString());
    setOutput("critical", counts.critical.toString());
    setOutput("high", counts.high.toString());
    setOutput("medium", counts.medium.toString());
    setOutput("low", counts.low.toString());
    console.log("✅ Vulnerability scan summary:");
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
    console.warn("Continuing despite parse error...");
  }
}
parseTrivyResults();
