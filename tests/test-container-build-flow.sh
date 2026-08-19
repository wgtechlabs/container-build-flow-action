#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DETECT_SCRIPT="$ROOT/scripts/detect-build-flow.sh"
OUTPUT_SCRIPT="$ROOT/scripts/generate-outputs.sh"
SHA="0123456789abcdef"

fail() {
    echo "FAIL: $*" >&2
    exit 1
}

output_value() {
    local file="$1"
    local key="$2"
    grep "^${key}=" "$file" | tail -n1 | cut -d= -f2-
}

run_detect() {
    local planned_tag="$1"
    local release_tag_pattern="${2:-}"
    local tag_prefix="${3-release-}"
    local tag_suffix="${4--alpine}"
    local output_file
    local -a env_args
    output_file="$(mktemp)"

    env_args=(
        GITHUB_EVENT_NAME=push
        GITHUB_REF=refs/heads/main
        GITHUB_SHA="$SHA"
        GITHUB_REPOSITORY=example/widget
        GITHUB_REPOSITORY_OWNER=example
        GITHUB_OUTPUT="$output_file"
        MAIN_BRANCH=main
        DEV_BRANCH=dev
        PLANNED_VERSION_TAG="$planned_tag"
        TAG_PREFIX="$tag_prefix"
        TAG_SUFFIX="$tag_suffix"
    )
    if [ -n "$release_tag_pattern" ]; then
        env_args+=(RELEASE_TAG_PATTERN="$release_tag_pattern")
    fi
    env "${env_args[@]}" bash "$DETECT_SCRIPT" >/dev/null

    cat "$output_file"
    rm -f "$output_file"
}

assert_planned_main_release() {
    local output
    output="$(run_detect v1.2.3)"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "release" ]] ||
        fail "planned tag must produce a release flow"
    [[ "$(printf '%s\n' "$output" | grep '^tags=' | cut -d= -f2-)" == "release-1.2.3-alpine" ]] ||
        fail "planned tag must strip only its leading v and respect tag prefix/suffix"
    printf '%s\n' "$output" | grep -q '^type=raw,value=release-1.2-alpine$' ||
        fail "planned tag must include its minor release tag"
    printf '%s\n' "$output" | grep -q '^type=raw,value=release-1-alpine$' ||
        fail "planned tag must include its major release tag"
    printf '%s\n' "$output" | grep -q '^type=raw,value=release-latest-alpine$' ||
        fail "planned tag must include latest"
}

assert_planned_custom_pattern_preserves_version_prefix() {
    local output
    output="$(run_detect version-1.2.3 '^version-[0-9]+\.[0-9]+\.[0-9]+$' "" "")"

    [[ "$(printf '%s\n' "$output" | grep '^tags=' | cut -d= -f2-)" == "version-1.2.3" ]] ||
        fail "planned tags that do not start with v followed by a digit must remain unchanged"
}

assert_planned_main_prerelease() {
    local output
    output="$(run_detect v1.2.3-rc.1)"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "release" ]] ||
        fail "planned prerelease tag must produce a release flow"
    [[ "$(printf '%s\n' "$output" | grep '^tags=' | cut -d= -f2-)" == "release-1.2.3-rc.1-alpine" ]] ||
        fail "planned prerelease tag must use its exact version tag"
    printf '%s\n' "$output" | grep -q '^type=raw,value=release-rc-alpine$' ||
        fail "planned prerelease tag must include its channel tag"
    if printf '%s\n' "$output" | grep -Eq '^type=raw,value=release-(1\.2|1|latest)-alpine$'; then
        fail "planned prerelease tag must not include production floating tags"
    fi
}

assert_planned_numeric_prerelease() {
    local output
    output="$(run_detect v1.2.3-1)"

    [[ "$(printf '%s\n' "$output" | grep '^tags=' | cut -d= -f2-)" == "release-1.2.3-1-alpine" ]] ||
        fail "planned numeric prerelease must use its exact version tag"
    [[ "$(printf '%s\n' "$output" | grep -c '^type=raw,value=release-1-alpine$')" == "1" ]] ||
        fail "planned numeric prerelease must include only its numeric channel tag"
    if printf '%s\n' "$output" | grep -Eq '^type=raw,value=release-(1\.2|latest)-alpine$'; then
        fail "planned numeric prerelease must not include production floating tags"
    fi
}

assert_planned_custom_pattern_prerelease() {
    local output
    output="$(run_detect prefix-1.2.3-rc.1 '^prefix-[0-9]+\.[0-9]+\.[0-9]+-[a-zA-Z0-9.-]+$' "" "")"

    [[ "$(printf '%s\n' "$output" | grep '^tags=' | cut -d= -f2-)" == "prefix-1.2.3-rc.1" ]] ||
        fail "custom-pattern prerelease must use its exact version tag"
    printf '%s\n' "$output" | grep -q '^type=raw,value=rc$' ||
        fail "custom-pattern prerelease must include its channel tag"
    if printf '%s\n' "$output" | grep -q '^type=raw,value=latest$'; then
        fail "custom-pattern prerelease must not include latest"
    fi
}

assert_omitted_planned_tag_stages_main() {
    local output
    output="$(run_detect "")"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "staging" ]] ||
        fail "main pushes without a planned tag must remain staging"
}

assert_invalid_planned_tag_skips_main() {
    local output
    output="$(run_detect invalid-tag)"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "skip" ]] ||
        fail "main pushes with an invalid planned tag must skip"
}

run_output() {
    local registry="$1"
    local dockerhub_published="$2"
    local ghcr_published="$3"
    local push_enabled="$4"
    local dockerhub_build_outcome="${5:-success}"
    local ghcr_build_outcome="${6:-success}"
    local output_file
    local dockerhub_tags=""
    local ghcr_tags=""
    output_file="$(mktemp)"

    if [ "$dockerhub_published" = "true" ]; then
        dockerhub_tags="example/widget:1.2.3"
    fi
    if [ "$ghcr_published" = "true" ]; then
        ghcr_tags="ghcr.io/example/widget:1.2.3"
    fi

    if ! BUILD_DIGEST="sha256:example" \
        BUILD_FLOW_TYPE=release \
        IMAGE_TAGS="example/widget:1.2.3" \
        SHORT_SHA="${SHA:0:7}" \
        REGISTRY="$registry" \
        DOCKERHUB_PUBLISHED="$dockerhub_published" \
        GHCR_PUBLISHED="$ghcr_published" \
        DOCKERHUB_BUILD_OUTCOME="$dockerhub_build_outcome" \
        GHCR_BUILD_OUTCOME="$ghcr_build_outcome" \
        PUSH_ENABLED="$push_enabled" \
        DOCKERHUB_IMAGE_TAGS="$dockerhub_tags" \
        GHCR_IMAGE_TAGS="$ghcr_tags" \
        GITHUB_OUTPUT="$output_file" \
        bash "$OUTPUT_SCRIPT" >/dev/null; then
        cat "$output_file"
        rm -f "$output_file"
        return 1
    fi

    cat "$output_file"
    rm -f "$output_file"
}

assert_registry_aggregation() {
    local output
    output="$(run_output both false true true)"
    [[ "$(printf '%s\n' "$output" | grep '^dockerhub-published=' | cut -d= -f2-)" == "false" ]] ||
        fail "Docker Hub must report false when only GHCR succeeds"
    [[ "$(printf '%s\n' "$output" | grep '^ghcr-published=' | cut -d= -f2-)" == "true" ]] ||
        fail "GHCR must report true when it succeeds"
    [[ "$(printf '%s\n' "$output" | grep '^artifact-published=' | cut -d= -f2-)" == "true" ]] ||
        fail "a GHCR-only success must publish an artifact"
    [[ "$(printf '%s\n' "$output" | grep '^image-tags=' | cut -d= -f2-)" == "ghcr.io/example/widget:1.2.3" ]] ||
        fail "a GHCR-only success must expose only its GHCR image tag"

    output="$(run_output both true false true)"
    [[ "$(printf '%s\n' "$output" | grep '^artifact-published=' | cut -d= -f2-)" == "true" ]] ||
        fail "a Docker Hub-only success must publish an artifact"
    [[ "$(printf '%s\n' "$output" | grep '^image-tags=' | cut -d= -f2-)" == "example/widget:1.2.3" ]] ||
        fail "a Docker Hub-only success must expose only its Docker Hub image tag"

    if output="$(run_output both false false true)"; then
        fail "both selected registry failures must fail after writing outputs"
    fi
    [[ "$(printf '%s\n' "$output" | grep '^artifact-published=' | cut -d= -f2-)" == "false" ]] ||
        fail "both selected registry failures must report artifact-published=false"
}

assert_no_push_registry_aggregation() {
    local output
    output="$(run_output both false false false success failure)"

    [[ "$(printf '%s\n' "$output" | grep '^artifact-published=' | cut -d= -f2-)" == "false" ]] ||
        fail "no-push builds with no registry results must report artifact-published=false"

    if output="$(run_output both false false false failure failure)"; then
        fail "no-push builds must fail when all selected builds fail"
    fi
}

assert_planned_main_release
assert_planned_custom_pattern_preserves_version_prefix
assert_planned_main_prerelease
assert_planned_numeric_prerelease
assert_planned_custom_pattern_prerelease
assert_omitted_planned_tag_stages_main
assert_invalid_planned_tag_skips_main
assert_registry_aggregation
assert_no_push_registry_aggregation

echo "PASS: container build flow behavior"
