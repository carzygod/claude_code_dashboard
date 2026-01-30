FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update and install required packages
# python3, make, g++ are required for building node-pty
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3 /usr/bin/python

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Install Claude Code CLI
# The install script might ask for interactive input, but usually piped to bash it's fine.
# If it fails, we might need a workaround.
# For now, following user's script:
RUN curl -fsSL https://claude.ai/install.sh | bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json tsconfig.json ./

# Install dependencies (will compile node-pty)
RUN npm install

# Copy source
COPY src ./src
COPY public ./public

# Build TypeScript
RUN npm run build

# Create a workspace directory for the user to mount
WORKDIR /workspace

# Expose port
EXPOSE 4000

# Set back to app dir for starting
WORKDIR /app

# Start the server
CMD ["npm", "start"]
