# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]




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

