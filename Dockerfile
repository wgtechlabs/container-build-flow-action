# Test Dockerfile for Container Build Flow Action
# This is a minimal image used to validate the action's functionality

FROM alpine:3.19

# Add metadata
LABEL maintainer="WG Technology Labs <hello@wgtechlabs.com>"
LABEL description="Test container for validating container-build-flow-action"
LABEL org.opencontainers.image.source="https://github.com/wgtechlabs/container-build-flow-action"

# Install basic utilities for testing
RUN apk add --no-cache \
    bash \
    curl \
    jq

# Create a simple test script
RUN echo '#!/bin/bash' > /usr/local/bin/test.sh && \
    echo 'echo "Container Build Flow Action Test - SUCCESS"' >> /usr/local/bin/test.sh && \
    echo 'echo "Build Date: $(date)"' >> /usr/local/bin/test.sh && \
    echo 'echo "Architecture: $(uname -m)"' >> /usr/local/bin/test.sh && \
    chmod +x /usr/local/bin/test.sh

# Set working directory
WORKDIR /app

# Default command
CMD ["/usr/local/bin/test.sh"]
