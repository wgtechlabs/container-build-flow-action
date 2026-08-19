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
    local event_name="${5:-push}"
    local output_file
    local -a env_args
    output_file="$(mktemp)"

    env_args=(
        GITHUB_EVENT_NAME="$event_name"
        GITHUB_REF=refs/heads/main
        GITHUB_SHA="$SHA"
        GITHUB_REPOSITORY=example/widget
        GITHUB_REPOSITORY_OWNER=example
        GITHUB_OUTPUT="$output_file"
        MAIN_BRANCH=main
        DEV_BRANCH=dev
        PLANNED_VERSION_TAG="$planned_tag"
        RELEASE_TAG="$planned_tag"
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

assert_planned_dispatch_release() {
    local output
    output="$(run_detect v1.2.3 "" "" "" workflow_dispatch)"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "release" ]] ||
        fail "planned tag must produce a release flow when dispatching main"
    [[ "$(printf '%s\n' "$output" | grep '^tags=' | cut -d= -f2-)" == "1.2.3" ]] ||
        fail "planned dispatch tag must generate its release version"
}

assert_omitted_planned_tag_keeps_dispatch_wip() {
    local output
    output="$(run_detect "" "" "" "" workflow_dispatch)"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "wip" ]] ||
        fail "manual main dispatches without a planned tag must remain WIP"
}

assert_invalid_planned_dispatch_skips_main() {
    local output
    output="$(run_detect invalid-tag "" "" "" workflow_dispatch)"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "skip" ]] ||
        fail "invalid planned tags must skip when dispatching main"
}

assert_release_event_remains_release() {
    local output
    output="$(run_detect v1.2.3 "" "" "" release)"

    [[ "$(printf '%s\n' "$output" | grep '^build-flow-type=' | cut -d= -f2-)" == "release" ]] ||
        fail "release events must remain release flows"
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

action_step() {
    local name="$1"

    awk -v name="$name" '
        /^    - name: / {
            if (capture) {
                exit
            }
            capture = index($0, "- name: " name) > 0
        }
        capture {
            print
        }
    ' "$ROOT/action.yml"
}

assert_registry_builds_require_successful_logins_when_pushing() {
    local dockerhub_login
    local ghcr_login
    local dockerhub_build
    local ghcr_build

    dockerhub_login="$(action_step "Login to Docker Hub")"
    ghcr_login="$(action_step "Login to GitHub Container Registry")"
    dockerhub_build="$(action_step "Build and Push Docker Hub Image")"
    ghcr_build="$(action_step "Build and Push GHCR Image")"

    [[ "$dockerhub_login" == *"id: dockerhub-login"* ]] ||
        fail "Docker Hub login must have a stable ID"
    [[ "$ghcr_login" == *"id: ghcr-login"* ]] ||
        fail "GHCR login must have a stable ID"
    [[ "$dockerhub_login" == *"continue-on-error: true"* ]] ||
        fail "Docker Hub login must remain independently attempted"
    [[ "$ghcr_login" == *"continue-on-error: true"* ]] ||
        fail "GHCR login must remain independently attempted"
    [[ "$dockerhub_build" == *"steps.push-enabled.outputs.value != 'true' || steps.dockerhub-login.outcome == 'success'"* ]] ||
        fail "Docker Hub push builds must require a successful Docker Hub login"
    [[ "$ghcr_build" == *"steps.push-enabled.outputs.value != 'true' || steps.ghcr-login.outcome == 'success'"* ]] ||
        fail "GHCR push builds must require a successful GHCR login"
}

assert_push_enabled_normalization_contract() {
    local normalizer
    local dockerhub_login
    local ghcr_login
    local dockerhub_build
    local ghcr_build
    local outputs
    local failure_guard

    normalizer="$(action_step "Normalize Push Enabled")"
    dockerhub_login="$(action_step "Login to Docker Hub")"
    ghcr_login="$(action_step "Login to GitHub Container Registry")"
    dockerhub_build="$(action_step "Build and Push Docker Hub Image")"
    ghcr_build="$(action_step "Build and Push GHCR Image")"
    outputs="$(action_step "Generate Action Outputs")"
    failure_guard="$(action_step "Fail if all selected registry attempts failed")"

    [[ "$normalizer" == *"id: push-enabled"* ]] ||
        fail "push-enabled must have a stable normalizer step ID"
    [[ "$normalizer" == *"!cancelled()"* ]] ||
        fail "push-enabled normalizer must not run for canceled flows"
    [[ "$normalizer" == *"steps.commit-gate.outputs.should-build != 'false'"* ]] ||
        fail "push-enabled normalizer must not run for commit-gated flows"
    [[ "$normalizer" == *"steps.detect.outputs.build-flow-type != 'skip'"* ]] ||
        fail "push-enabled normalizer must not run for skipped flows"
    [[ "$normalizer" == *"PUSH_ENABLED_INPUT: \${{ inputs.push-enabled }}"* ]] ||
        fail "push-enabled normalizer must receive the raw action input"
    [[ "$normalizer" == *'PUSH_ENABLED="${PUSH_ENABLED_INPUT#"${PUSH_ENABLED_INPUT%%[![:space:]]*}"}"'* ]] ||
        fail "push-enabled normalizer must trim leading whitespace"
    [[ "$normalizer" == *'PUSH_ENABLED="${PUSH_ENABLED%"${PUSH_ENABLED##*[![:space:]]}"}"'* ]] ||
        fail "push-enabled normalizer must trim trailing whitespace"
    [[ "$normalizer" == *'case "$PUSH_ENABLED" in'* && "$normalizer" == *"true|false)"* ]] ||
        fail "push-enabled normalizer must reject values other than true or false"
    [[ "$normalizer" == *'echo "value=${PUSH_ENABLED}" >> "$GITHUB_OUTPUT"'* ]] ||
        fail "push-enabled normalizer must emit its canonical output"

    [[ "$dockerhub_login" == *"steps.push-enabled.outputs.value == 'true'"* ]] ||
        fail "Docker Hub login must use canonical push-enabled=true"
    [[ "$ghcr_login" == *"steps.push-enabled.outputs.value == 'true'"* ]] ||
        fail "GHCR login must use canonical push-enabled=true"
    [[ "$dockerhub_build" == *"steps.push-enabled.outputs.value != 'true' || steps.dockerhub-login.outcome == 'success'"* ]] ||
        fail "Docker Hub build must use canonical push-enabled for its login requirement"
    [[ "$ghcr_build" == *"steps.push-enabled.outputs.value != 'true' || steps.ghcr-login.outcome == 'success'"* ]] ||
        fail "GHCR build must use canonical push-enabled for its login requirement"
    [[ "$dockerhub_build" == *'push: ${{ steps.push-enabled.outputs.value }}'* ]] ||
        fail "Docker Hub build must use canonical push-enabled"
    [[ "$ghcr_build" == *'push: ${{ steps.push-enabled.outputs.value }}'* ]] ||
        fail "GHCR build must use canonical push-enabled"
    [[ "$outputs" == *'PUSH_ENABLED: ${{ steps.push-enabled.outputs.value }}'* ]] ||
        fail "output aggregation must receive canonical push-enabled"
    [[ "$outputs" == *"steps.push-enabled.outputs.value == 'true' && steps.dockerhub-build.outcome == 'success'"* ]] ||
        fail "Docker Hub publication aggregation must use canonical push-enabled"
    [[ "$outputs" == *"steps.push-enabled.outputs.value == 'true' && steps.ghcr-build.outcome == 'success'"* ]] ||
        fail "GHCR publication aggregation must use canonical push-enabled"
    [[ "$failure_guard" == *"steps.push-enabled.outputs.value == 'true'"* &&
       "$failure_guard" == *"steps.push-enabled.outputs.value != 'true'"* ]] ||
        fail "aggregate failure guard must use canonical push-enabled"
}

assert_planned_dispatch_bypasses_commit_gate() {
    local commit_gate
    commit_gate="$(action_step "Commit Convention Gate")"

    [[ "$commit_gate" == *'workflow_dispatch'* ]] ||
        fail "planned main dispatches must bypass the commit convention gate"
}

assert_planned_main_release
assert_planned_custom_pattern_preserves_version_prefix
assert_planned_main_prerelease
assert_planned_numeric_prerelease
assert_planned_custom_pattern_prerelease
assert_omitted_planned_tag_stages_main
assert_invalid_planned_tag_skips_main
assert_planned_dispatch_release
assert_omitted_planned_tag_keeps_dispatch_wip
assert_invalid_planned_dispatch_skips_main
assert_release_event_remains_release
assert_registry_aggregation
assert_no_push_registry_aggregation
assert_registry_builds_require_successful_logins_when_pushing
assert_push_enabled_normalization_contract
assert_planned_dispatch_bypasses_commit_gate

echo "PASS: container build flow behavior"
