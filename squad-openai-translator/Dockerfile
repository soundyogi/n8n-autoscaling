FROM oven/bun:1 as base

WORKDIR /app

# Copy package.json and bun.lock
COPY package.json ./
COPY bun.lock ./

# Install dependencies
RUN bun install

# Copy source files
COPY . .

# Expose the port
EXPOSE 3001

# Create a healthcheck to ensure the server is running properly
HEALTHCHECK --interval=2s --timeout=5s --start-period=5s --retries=10 \
  CMD bun --fetch http://localhost:3001/health || exit 1

# Start the server using Bun
CMD ["bun", "run", "start"]