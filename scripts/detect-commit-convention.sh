#!/bin/bash
# =============================================================================
# DETECT COMMIT CONVENTION - Smart Build Gate
# =============================================================================
# Analyzes commit messages to determine if a container build should proceed.
# Inspired by the commit convention detection in release-build-flow-action.
#
# This script parses the HEAD commit message (or PR title) using Clean Commit
# or Conventional Commit conventions and decides whether the commit type
# warrants triggering a container build.
#
# Flow:
#   1. Get the commit message (HEAD commit for push, PR title for PRs)
#   2. Strip emoji prefix, extract the commit type
#   3. Check against build-trigger-types / build-skip-types
#   4. Output should-build=true|false
#
# Environment Variables:
#   - COMMIT_CONVENTION_ENABLED : Enable/disable the gate (true/false)
#   - COMMIT_CONVENTION         : Convention to parse (clean-commit/conventional)
#   - BUILD_TRIGGER_TYPES       : Comma-separated commit types that trigger builds
#   - BUILD_SKIP_TYPES          : Comma-separated commit types that skip builds
#   - GITHUB_EVENT_NAME         : GitHub Actions event name
#   - PR_TITLE                  : Pull request title (for PR events)
#
# Outputs (via GitHub Actions):
#   - should-build      : Whether to proceed with the build (true/false)
#   - commit-type       : Detected commit type from the message
#   - build-skip-reason : Reason the build was skipped (empty if building)
#   - build-flow-type   : Set to 'skip' when build is skipped (empty otherwise)
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

COMMIT_CONVENTION_ENABLED="${COMMIT_CONVENTION_ENABLED:-false}"
COMMIT_CONVENTION="${COMMIT_CONVENTION:-clean-commit}"
GITHUB_EVENT_NAME="${GITHUB_EVENT_NAME:-}"
PR_TITLE="${PR_TITLE:-}"

# Convention-aware defaults for trigger/skip types.
# action.yml passes empty strings when the user hasn't customized the lists,
# so we check for empty (not just unset) before applying defaults.
if [[ -z "${BUILD_TRIGGER_TYPES:-}" ]]; then
    if [[ "${COMMIT_CONVENTION}" == "conventional" ]]; then
        BUILD_TRIGGER_TYPES="feat,fix,perf,refactor,revert,security"
    else
        BUILD_TRIGGER_TYPES="new,feat,add,fix,bugfix,update,refactor,perf,security,remove,delete,setup,chore"
    fi
fi

if [[ -z "${BUILD_SKIP_TYPES:-}" ]]; then
    if [[ "${COMMIT_CONVENTION}" == "conventional" ]]; then
        BUILD_SKIP_TYPES="docs,test,style,ci,build,chore"
    else
        BUILD_SKIP_TYPES="docs,test,release,style,ci,build"
    fi
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}" >&2
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}" >&2
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" >&2
}

log_error() {
    echo -e "${RED}❌ $1${NC}" >&2
}

log_debug() {
    echo -e "${CYAN}🔍 $1${NC}" >&2
}

# =============================================================================
# COMMIT MESSAGE RETRIEVAL
# =============================================================================

get_commit_message() {
    local message=""

    if [ "$GITHUB_EVENT_NAME" = "pull_request" ] || [ "$GITHUB_EVENT_NAME" = "pull_request_target" ]; then
        # For PRs, prefer the PR title (GitHub uses this for squash merges)
        if [ -n "$PR_TITLE" ]; then
            message="$PR_TITLE"
            log_debug "Using PR title: ${message}"
        else
            # Fallback to the HEAD commit of the PR
            message=$(git log -1 --format='%s' 2>/dev/null || echo "")
            log_debug "Using latest commit subject: ${message}"
        fi
    elif [ "$GITHUB_EVENT_NAME" = "push" ]; then
        # For push events, use the HEAD commit message
        message=$(git log -1 --format='%s' 2>/dev/null || echo "")
        log_debug "Using HEAD commit subject: ${message}"
    else
        # For other events (release, etc.), return empty
        message=""
    fi

    echo "$message"
}

# =============================================================================
# COMMIT TYPE EXTRACTION
# =============================================================================

extract_commit_type() {
    local subject="$1"

    # Strip leading emoji and whitespace before parsing
    # Use bash parameter expansion to handle 4-byte UTF-8 emoji sequences
    local prefix="${subject%%[a-zA-Z]*}"
    local cleaned_subject="${subject#"$prefix"}"

    # Parse conventional/clean commit format: type(scope)!: description
    # Allow optional whitespace before scope parentheses (Clean Commit format)
    local pattern='^([a-z]+)[[:space:]]*(\([^)]+\))?(!)?: '
    if [[ "${cleaned_subject}" =~ $pattern ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo ""
    fi
}

# =============================================================================
# TYPE MATCHING
# =============================================================================

# Check if a type is in a comma-separated list.
# Note: if a type appears in both trigger and skip lists, skip takes priority
# because the skip list is checked first.
is_in_list() {
    local type="$1"
    local list="$2"

    IFS=',' read -ra ITEMS <<< "$list"
    for item in "${ITEMS[@]}"; do
        # Trim leading/trailing whitespace using bash parameter expansion
        item="${item#"${item%%[![:space:]]*}"}"
        item="${item%"${item##*[![:space:]]}"}"
        if [ "$type" = "$item" ]; then
            return 0
        fi
    done
    return 1
}

# =============================================================================
# MAIN LOGIC
# =============================================================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       Container Build Flow - Commit Convention Gate           ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # Validate GITHUB_OUTPUT is available
    if [ -z "${GITHUB_OUTPUT:-}" ]; then
        log_error "GITHUB_OUTPUT is not set (not running in GitHub Actions?)"
        exit 1
    fi

    # If the feature is disabled, always build
    if [ "$COMMIT_CONVENTION_ENABLED" != "true" ]; then
        log_info "Commit convention gate is disabled, proceeding with build"
        {
            echo "should-build=true"
            echo "commit-type="
            echo "build-skip-reason="
            echo "build-flow-type="
        } >> "$GITHUB_OUTPUT"
        return 0
    fi

    log_info "Commit convention gate is ENABLED (convention: ${COMMIT_CONVENTION})"

    # Release events always build — they are intentional
    if [ "$GITHUB_EVENT_NAME" = "release" ]; then
        log_success "Release event detected — always building"
        {
            echo "should-build=true"
            echo "commit-type=release"
            echo "build-skip-reason="
            echo "build-flow-type="
        } >> "$GITHUB_OUTPUT"
        return 0
    fi

    # Get the commit message
    local message
    message=$(get_commit_message)

    if [ -z "$message" ]; then
        log_warning "Could not retrieve commit message, proceeding with build (safe default)"
        {
            echo "should-build=true"
            echo "commit-type="
            echo "build-skip-reason="
            echo "build-flow-type="
        } >> "$GITHUB_OUTPUT"
        return 0
    fi

    log_info "Analyzing commit message: ${message}"

    # Extract the commit type
    local commit_type
    commit_type=$(extract_commit_type "$message")

    if [ -z "$commit_type" ]; then
        log_warning "Could not parse commit type from message, proceeding with build (safe default)"
        {
            echo "should-build=true"
            echo "commit-type="
            echo "build-skip-reason="
            echo "build-flow-type="
        } >> "$GITHUB_OUTPUT"
        return 0
    fi

    log_debug "Detected commit type: ${commit_type}"

    # Check skip list first (explicit skips take priority)
    if is_in_list "$commit_type" "$BUILD_SKIP_TYPES"; then
        log_warning "Skipping build: commit type '${commit_type}' is in the skip list"
        {
            echo "should-build=false"
            echo "commit-type=${commit_type}"
            echo "build-skip-reason=commit type '${commit_type}' is not a build trigger"
            echo "build-flow-type=skip"
        } >> "$GITHUB_OUTPUT"

        echo ""
        log_info "Summary:"
        echo -e "  ${CYAN}Should Build:${NC} false"
        echo -e "  ${CYAN}Commit Type:${NC} ${commit_type}"
        echo -e "  ${CYAN}Reason:${NC} Commit type '${commit_type}' is in the skip list (${BUILD_SKIP_TYPES})"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        return 0
    fi

    # Check trigger list
    if is_in_list "$commit_type" "$BUILD_TRIGGER_TYPES"; then
        log_success "Build triggered: commit type '${commit_type}' is a build trigger"
        {
            echo "should-build=true"
            echo "commit-type=${commit_type}"
            echo "build-skip-reason="
            echo "build-flow-type="
        } >> "$GITHUB_OUTPUT"

        echo ""
        log_info "Summary:"
        echo -e "  ${CYAN}Should Build:${NC} true"
        echo -e "  ${CYAN}Commit Type:${NC} ${commit_type}"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        return 0
    fi

    # Type not recognized in either list — build anyway (safe default)
    log_warning "Commit type '${commit_type}' not in trigger or skip list, proceeding with build (safe default)"
    {
        echo "should-build=true"
        echo "commit-type=${commit_type}"
        echo "build-skip-reason="
        echo "build-flow-type="
    } >> "$GITHUB_OUTPUT"

    echo ""
    log_info "Summary:"
    echo -e "  ${CYAN}Should Build:${NC} true"
    echo -e "  ${CYAN}Commit Type:${NC} ${commit_type}"
    echo -e "  ${CYAN}Note:${NC} Type not in trigger or skip list, defaulting to build"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Execute main function
main "$@"
