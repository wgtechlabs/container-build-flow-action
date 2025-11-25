#!/bin/bash
# =============================================================================
# DETECT BUILD FLOW - Phase 2 Implementation
# =============================================================================
# Intelligent build flow detection based on GitHub PR context
# 
# This script analyzes the current GitHub Actions environment to determine
# the appropriate build flow type and generate corresponding container tags.
#
# Flow Types:
#   - pr-{sha}    : Pull request targeting dev branch
#   - dev-{sha}   : Pull request from dev to main branch
#   - patch-{sha} : Pull request to main (not from dev)
#   - wip-{sha}   : Work in progress (other branches)
#
# Usage:
#   Called automatically by GitHub Actions composite action
#   Environment variables are set by action.yml
#
# Outputs (via GitHub Actions):
#   - build-flow-type : The detected flow type
#   - tags            : Generated container tags
#   - short-sha       : Short commit SHA
#   - dockerhub-image : Docker Hub image name
#   - ghcr-image      : GHCR image name
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION & DEFAULTS
# =============================================================================

# GitHub context (automatically provided by Actions)
GITHUB_EVENT_NAME="${GITHUB_EVENT_NAME:-}"
GITHUB_REF="${GITHUB_REF:-}"
GITHUB_SHA="${GITHUB_SHA:-}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
GITHUB_HEAD_REF="${GITHUB_HEAD_REF:-}"
GITHUB_BASE_REF="${GITHUB_BASE_REF:-}"

# User-configurable inputs (from action.yml)
MAIN_BRANCH="${MAIN_BRANCH:-main}"
DEV_BRANCH="${DEV_BRANCH:-dev}"
TAG_PREFIX="${TAG_PREFIX:-}"
TAG_SUFFIX="${TAG_SUFFIX:-}"
IMAGE_NAME="${IMAGE_NAME:-}"

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

# Extract short SHA (first 7 characters)
get_short_sha() {
    local sha="${1:-$GITHUB_SHA}"
    echo "${sha:0:7}"
}

# Get repository name (without org prefix)
get_repo_name() {
    echo "${GITHUB_REPOSITORY##*/}"
}

# Sanitize branch name for tag usage
sanitize_branch_name() {
    local branch="$1"
    # Replace slashes and special characters with hyphens
    echo "$branch" | sed 's/[^a-zA-Z0-9._-]/-/g' | sed 's/--*/-/g' | tr '[:upper:]' '[:lower:]'
}

# =============================================================================
# IMAGE NAME RESOLUTION
# =============================================================================

resolve_image_names() {
    local repo_name
    repo_name=$(get_repo_name)
    
    # Use custom image name if provided, otherwise use repository name
    local base_image_name="${IMAGE_NAME:-$repo_name}"
    
    # Construct full image names
    DOCKERHUB_IMAGE="${GITHUB_REPOSITORY_OWNER}/${base_image_name}"
    GHCR_IMAGE="ghcr.io/${GITHUB_REPOSITORY_OWNER}/${base_image_name}"
    
    log_debug "Image names resolved:"
    log_debug "  Docker Hub: ${DOCKERHUB_IMAGE}"
    log_debug "  GHCR: ${GHCR_IMAGE}"
}

# =============================================================================
# BUILD FLOW DETECTION LOGIC
# =============================================================================

detect_build_flow() {
    log_info "Analyzing GitHub context for build flow detection..."
    
    # Debug: Display GitHub context
    log_debug "GitHub Context:"
    log_debug "  Event: ${GITHUB_EVENT_NAME}"
    log_debug "  Ref: ${GITHUB_REF}"
    log_debug "  Head Ref: ${GITHUB_HEAD_REF:-<not set>}"
    log_debug "  Base Ref: ${GITHUB_BASE_REF:-<not set>}"
    log_debug "  SHA: ${GITHUB_SHA}"
    log_debug "  Repository: ${GITHUB_REPOSITORY}"
    
    log_debug "Configuration:"
    log_debug "  Main Branch: ${MAIN_BRANCH}"
    log_debug "  Dev Branch: ${DEV_BRANCH}"
    
    local flow_type=""
    local short_sha
    short_sha=$(get_short_sha)
    
    # =============================================================================
    # FLOW DETECTION ALGORITHM
    # =============================================================================
    
    if [ "$GITHUB_EVENT_NAME" = "pull_request" ] || [ "$GITHUB_EVENT_NAME" = "pull_request_target" ]; then
        log_info "Pull request detected"
        
        # Extract base and head branch names
        local base_branch="${GITHUB_BASE_REF}"
        local head_branch="${GITHUB_HEAD_REF}"
        
        log_debug "  Base branch (target): ${base_branch}"
        log_debug "  Head branch (source): ${head_branch}"
        
        # PR to dev branch -> pr-{sha}
        if [ "$base_branch" = "$DEV_BRANCH" ]; then
            flow_type="pr"
            log_success "Flow: PR to dev branch"
            
        # PR from dev to main -> dev-{sha}
        elif [ "$base_branch" = "$MAIN_BRANCH" ] && [ "$head_branch" = "$DEV_BRANCH" ]; then
            flow_type="dev"
            log_success "Flow: Dev to main promotion"
            
        # PR to main (not from dev) -> patch-{sha}
        elif [ "$base_branch" = "$MAIN_BRANCH" ]; then
            flow_type="patch"
            log_success "Flow: Patch to main (hotfix)"
            
        # Any other PR -> wip-{sha}
        else
            flow_type="wip"
            log_warning "Flow: Work in progress (non-standard PR)"
        fi
        
    elif [ "$GITHUB_EVENT_NAME" = "push" ]; then
        log_info "Push event detected"
        
        # Extract branch name from ref
        local branch="${GITHUB_REF#refs/heads/}"
        log_debug "  Branch: ${branch}"
        
        # Push to dev branch -> dev-{sha}
        if [ "$branch" = "$DEV_BRANCH" ]; then
            flow_type="dev"
            log_success "Flow: Push to dev branch"
            
        # Push to main branch -> Use 'latest' or semantic version
        elif [ "$branch" = "$MAIN_BRANCH" ]; then
            flow_type="latest"
            log_success "Flow: Push to main branch (latest)"
            
        # Push to any other branch -> wip-{sha}
        else
            flow_type="wip"
            log_warning "Flow: Work in progress branch push"
        fi
        
    else
        # Fallback for other events
        flow_type="wip"
        log_warning "Flow: Unrecognized event type, using WIP"
    fi
    
    # =============================================================================
    # TAG GENERATION
    # =============================================================================
    
    log_info "Generating container tags..."
    
    local base_tag="${flow_type}-${short_sha}"
    local full_tag="${TAG_PREFIX}${base_tag}${TAG_SUFFIX}"
    
    log_debug "  Base tag: ${base_tag}"
    log_debug "  Full tag: ${full_tag}"
    
    # =============================================================================
    # EXPORT TO GITHUB ACTIONS
    # =============================================================================
    
    log_info "Exporting outputs to GitHub Actions..."
    
    # Export outputs using GitHub Actions output mechanism
    {
        echo "build-flow-type=${flow_type}"
        echo "tags=${full_tag}"
        echo "short-sha=${short_sha}"
        echo "dockerhub-image=${DOCKERHUB_IMAGE}"
        echo "ghcr-image=${GHCR_IMAGE}"
    } >> "$GITHUB_OUTPUT"
    
    log_success "Build flow detection complete!"
    echo ""
    log_info "Summary:"
    echo -e "  ${CYAN}Flow Type:${NC} ${flow_type}"
    echo -e "  ${CYAN}Tag:${NC} ${full_tag}"
    echo -e "  ${CYAN}Short SHA:${NC} ${short_sha}"
    echo -e "  ${CYAN}Docker Hub:${NC} ${DOCKERHUB_IMAGE}:${full_tag}"
    echo -e "  ${CYAN}GHCR:${NC} ${GHCR_IMAGE}:${full_tag}"
}

# =============================================================================
# VALIDATION
# =============================================================================

validate_environment() {
    log_info "Validating GitHub Actions environment..."
    
    local errors=0
    
    # Check required GitHub context variables
    if [ -z "$GITHUB_SHA" ]; then
        log_error "GITHUB_SHA is not set"
        errors=$((errors + 1))
    fi
    
    if [ -z "$GITHUB_REPOSITORY" ]; then
        log_error "GITHUB_REPOSITORY is not set"
        errors=$((errors + 1))
    fi
    
    if [ -z "$GITHUB_REPOSITORY_OWNER" ]; then
        log_error "GITHUB_REPOSITORY_OWNER is not set"
        errors=$((errors + 1))
    fi
    
    if [ -z "$GITHUB_OUTPUT" ]; then
        log_error "GITHUB_OUTPUT is not set (not running in GitHub Actions?)"
        errors=$((errors + 1))
    fi
    
    if [ $errors -gt 0 ]; then
        log_error "Environment validation failed with $errors error(s)"
        exit 1
    fi
    
    log_success "Environment validation passed"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         Container Build Flow - Branch Detection               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Validate environment
    validate_environment
    
    # Resolve image names
    resolve_image_names
    
    # Detect build flow and generate tags
    detect_build_flow
    
    echo ""
    log_success "Phase 2 execution complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Execute main function
main "$@"
