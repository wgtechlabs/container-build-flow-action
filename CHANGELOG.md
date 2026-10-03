# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [1.9.0] - 2026-08-20

### Added

- add planned registry publishing (#54)

### Changed

- support planned manual releases (#56)
- join image tags with real newline

## [1.8.1] - 2026-05-05

### Changed

- fix validation order and disabled-state outputs
- fix bot-detection false skips on human-authored PRs (#43)

## [1.8.0] - 2026-05-02

### Added

- add floating-tags input for non-release build flows

### Changed

- update extra-tags output comment to include floating tags
- Bump actions/github-script from 8 to 9 (#37)
- Bump aquasecurity/trivy-action from 0.35.0 to 0.36.0 (#38)

## [1.7.1] - 2026-04-06

### Changed

- update CHANGELOG.md for v1.7.0
- Bump typescript from 5.9.3 to 6.0.2 (#34)
- Bump docker/login-action from 3 to 4 (#33)
- Bump docker/build-push-action from 6 to 7 (#32)
- Bump docker/metadata-action from 5 to 6 (#31)
- Bump docker/setup-buildx-action from 3 to 4 (#30)
- Bump aquasecurity/trivy-action from 0.34.1 to 0.35.0 (#29)
- Bump aquasecurity/trivy-action from 0.33.1 to 0.34.1 (#22)
- Bump actions/github-script from 7 to 8 (#24)
- Bump alpine from 3.21 to 3.23 (#23)
- Bump docker/build-push-action from 5 to 6 (#25)
- Bump actions/checkout from 4 to 6 (#26)
- Bump @types/node from 22.19.13 to 25.3.2 (#28)
- Bump github/codeql-action from 3 to 4
- add dependabot configuration for automated updates

### Security

- fix trivy-action tag to use v-prefix for resolution

## [1.7.0] - 2026-02-28

### Added

- add bot detection input and outputs for CI build management

## [1.6.0] - 2026-02-28

### Added

- add unified workflow for container build and release
- add release-platforms input and unified workflow example
- add release-platforms input and resolve build platforms step

## [1.5.0] - 2026-02-28

### Added

- migrate scripts to typescript

### Changed

- update action to use compiled dist output
- configure typescript build tooling

## [1.4.0] - 2026-02-28

### Added

- add commit convention gate for smart build filtering

### Changed

- bump alpine base image from 3.19 to 3.21

### Removed

- drop dockerhub credential secret name inputs
- remove unused sanitize_branch_name function

### Fixed

- conditional cache, pr comment events, dynamic version

## [1.3.1] - 2026-02-22

### Changed

- skip per-package monorepo release tags in container builds (#20)

## [1.3.0] - 2026-02-22

### Added

- add release workflow for automated version tagging

