#!/bin/bash
# =============================================================================
# GENERATE OUTPUTS - Step 4 Implementation
# =============================================================================
# Generate action outputs for consumption by workflows and subsequent steps
#
# This script processes build results and generates structured outputs that
# can be used by workflows, PR comments, and other automation.
#
# Inputs (from environment):
#   BUILD_DIGEST      : SHA256 digest from docker build
#   BUILD_METADATA    : Build metadata JSON
#   BUILD_FLOW_TYPE   : Detected flow type (pr, dev, patch, wip)
#   IMAGE_TAGS        : Complete tags from metadata action
#   SHORT_SHA         : Short commit SHA
#   REGISTRY          : Target registry (docker-hub, ghcr, both)
#
# Outputs (via GitHub Actions):
#   image-tags        : Formatted list of image tags
#   registry-urls     : Full URLs for each registry
#   build-digest      : Build digest SHA256
#   build-flow-type   : Flow type
#   short-sha         : Short SHA
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

BUILD_DIGEST="${BUILD_DIGEST:-}"
BUILD_METADATA="${BUILD_METADATA:-}"
BUILD_FLOW_TYPE="${BUILD_FLOW_TYPE:-}"
IMAGE_TAGS="${IMAGE_TAGS:-}"
SHORT_SHA="${SHORT_SHA:-}"
REGISTRY="${REGISTRY:-both}"
DOCKERHUB_PUBLISHED="${DOCKERHUB_PUBLISHED:-false}"
GHCR_PUBLISHED="${GHCR_PUBLISHED:-false}"
PUSH_ENABLED="${PUSH_ENABLED:-true}"
DOCKERHUB_IMAGE_TAGS="${DOCKERHUB_IMAGE_TAGS:-}"
GHCR_IMAGE_TAGS="${GHCR_IMAGE_TAGS:-}"

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
# OUTPUT PROCESSING
# =============================================================================

process_image_tags() {
    log_info "Processing image tags..."
    
    if [ -z "$IMAGE_TAGS" ]; then
        log_warning "No image tags provided"
        echo "none"
        return
    fi
    
    # Convert newline-separated tags to comma-separated
    local formatted_tags
    formatted_tags=$(echo "$IMAGE_TAGS" | tr '\n' ',' | sed 's/,$//')
    
    log_debug "  Formatted tags: ${formatted_tags}"
    echo "$formatted_tags"
}

generate_registry_urls() {
    log_info "Generating registry URLs..."
    
    if [ -z "$IMAGE_TAGS" ]; then
        log_warning "No image tags to generate URLs"
        echo "none"
        return
    fi
    
    local urls=()
    
    # Extract first tag from IMAGE_TAGS (they should all have same tag, different registries)
    local first_tag
    first_tag=$(echo "$IMAGE_TAGS" | head -n1)
    
    log_debug "  First tag: ${first_tag}"
    
    # Add URLs based on registry configuration
    case "$REGISTRY" in
        docker-hub)
            urls+=("docker pull ${first_tag}")
            ;;
        ghcr)
            urls+=("docker pull ${first_tag}")
            ;;
        both)
            # Extract both registry URLs from tags
            local dockerhub_tag ghcr_tag
            dockerhub_tag=$(echo "$IMAGE_TAGS" | grep -v "ghcr.io" | head -n1 || echo "")
            ghcr_tag=$(echo "$IMAGE_TAGS" | grep "ghcr.io" | head -n1 || echo "")
            
            if [ -n "$dockerhub_tag" ]; then
                urls+=("Docker Hub: docker pull ${dockerhub_tag}")
            fi
            if [ -n "$ghcr_tag" ]; then
                urls+=("GHCR: docker pull ${ghcr_tag}")
            fi
            ;;
        *)
            log_warning "Unknown registry type: ${REGISTRY}"
            ;;
    esac
    
    # Join URLs with newline
    local result
    result=$(IFS=$'\n'; echo "${urls[*]}")
    
    log_debug "  Registry URLs:"
    for url in "${urls[@]}"; do
        log_debug "    - ${url}"
    done
    
    echo "$result"
}

format_build_digest() {
    log_info "Formatting build digest..."
    
    if [ -z "$BUILD_DIGEST" ]; then
        log_warning "No build digest provided"
        echo "none"
        return
    fi
    
    log_debug "  Digest: ${BUILD_DIGEST}"
    echo "$BUILD_DIGEST"
}

# =============================================================================
# PUBLISH RESULTS
# =============================================================================

normalize_publish_results() {
    case "$REGISTRY" in
        docker-hub)
            GHCR_PUBLISHED="false"
            ;;
        ghcr)
            DOCKERHUB_PUBLISHED="false"
            ;;
        both)
            ;;
        *)
            log_warning "Unknown registry type: ${REGISTRY}"
            DOCKERHUB_PUBLISHED="false"
            GHCR_PUBLISHED="false"
            ;;
    esac

    if [ "$DOCKERHUB_PUBLISHED" != "true" ]; then
        DOCKERHUB_PUBLISHED="false"
    fi
    if [ "$GHCR_PUBLISHED" != "true" ]; then
        GHCR_PUBLISHED="false"
    fi

    if [ "$DOCKERHUB_PUBLISHED" = "true" ] || [ "$GHCR_PUBLISHED" = "true" ]; then
        ARTIFACT_PUBLISHED="true"
    else
        ARTIFACT_PUBLISHED="false"
    fi

    if [ "$ARTIFACT_PUBLISHED" = "true" ]; then
        IMAGE_TAGS=""
        PUBLISHED_IMAGE=""
        if [ "$DOCKERHUB_PUBLISHED" = "true" ]; then
            IMAGE_TAGS="$DOCKERHUB_IMAGE_TAGS"
            PUBLISHED_IMAGE=$(printf '%s\n' "$DOCKERHUB_IMAGE_TAGS" | head -n1)
        fi
        if [ "$GHCR_PUBLISHED" = "true" ]; then
            IMAGE_TAGS="${IMAGE_TAGS:+${IMAGE_TAGS}$'\n'}${GHCR_IMAGE_TAGS}"
            if [ -z "$PUBLISHED_IMAGE" ]; then
                PUBLISHED_IMAGE=$(printf '%s\n' "$GHCR_IMAGE_TAGS" | head -n1)
            fi
        fi
    else
        PUBLISHED_IMAGE=""
        if [ "$PUSH_ENABLED" != "true" ]; then
            IMAGE_TAGS="${DOCKERHUB_IMAGE_TAGS}${DOCKERHUB_IMAGE_TAGS:+$'\n'}${GHCR_IMAGE_TAGS}"
        fi
    fi
}

# =============================================================================
# VALIDATION
# =============================================================================

validate_inputs() {
    log_info "Validating inputs..."
    
    local warnings=0
    
    if [ -z "$BUILD_FLOW_TYPE" ]; then
        log_warning "BUILD_FLOW_TYPE not set"
        warnings=$((warnings + 1))
    fi
    
    if [ -z "$SHORT_SHA" ]; then
        log_warning "SHORT_SHA not set"
        warnings=$((warnings + 1))
    fi
    
    if [ -z "$IMAGE_TAGS" ]; then
        log_warning "IMAGE_TAGS not set"
        warnings=$((warnings + 1))
    fi
    
    if [ $warnings -gt 0 ]; then
        log_warning "Validation completed with $warnings warning(s)"
    else
        log_success "Input validation passed"
    fi
}

# =============================================================================
# OUTPUT GENERATION
# =============================================================================

generate_outputs() {
    log_info "Generating GitHub Actions outputs..."
    
    normalize_publish_results

    # Process all outputs
    local formatted_tags registry_urls formatted_digest
    
    formatted_tags=$(process_image_tags)
    registry_urls=$(generate_registry_urls)
    formatted_digest=$(format_build_digest)
    
    # Export to GitHub Actions
    if [ -n "$GITHUB_OUTPUT" ]; then
        {
            echo "image-tags=${formatted_tags}"
            echo "registry-urls<<EOF"
            echo "${registry_urls}"
            echo "EOF"
            echo "build-digest=${formatted_digest}"
            echo "build-flow-type=${BUILD_FLOW_TYPE}"
            echo "short-sha=${SHORT_SHA}"
            echo "dockerhub-published=${DOCKERHUB_PUBLISHED}"
            echo "ghcr-published=${GHCR_PUBLISHED}"
            echo "artifact-published=${ARTIFACT_PUBLISHED}"
            echo "published-image=${PUBLISHED_IMAGE}"
        } >> "$GITHUB_OUTPUT"
        
        log_success "Outputs written to GitHub Actions"
    else
        log_warning "GITHUB_OUTPUT not set, outputs not exported"
    fi
    
    # Display summary
    echo ""
    log_info "Output Summary:"
    echo -e "  ${CYAN}Flow Type:${NC} ${BUILD_FLOW_TYPE}"
    echo -e "  ${CYAN}Short SHA:${NC} ${SHORT_SHA}"
    echo -e "  ${CYAN}Image Tags:${NC} ${formatted_tags}"
    echo -e "  ${CYAN}Build Digest:${NC} ${formatted_digest}"
    echo -e "  ${CYAN}Docker Hub Published:${NC} ${DOCKERHUB_PUBLISHED}"
    echo -e "  ${CYAN}GHCR Published:${NC} ${GHCR_PUBLISHED}"
    echo -e "  ${CYAN}Artifact Published:${NC} ${ARTIFACT_PUBLISHED}"
    echo ""
    echo -e "  ${CYAN}Registry URLs:${NC}"
    echo "$registry_urls" | while IFS= read -r line; do
        echo -e "    ${line}"
    done
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         Container Build Flow - Output Generation              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Validate inputs
    validate_inputs
    
    # Generate and export outputs
    generate_outputs
    
    echo ""
    if [ "$PUSH_ENABLED" = "true" ] && [ "$ARTIFACT_PUBLISHED" != "true" ]; then
        log_error "All selected registry publish attempts failed"
        exit 1
    fi

    log_success "Step 4: Output generation complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Execute main function
main "$@"
