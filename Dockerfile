# Stage 1: Install dependencies and build the Next.js application
FROM node:20-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Copy package.json and lock files
# Use `package*.json` to cover package.json, package-lock.json, yarn.lock, etc.
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Install dependencies based on lock file presence
# --frozen-lockfile ensures deterministic builds
RUN \
  if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
  else npm install --frozen-lockfile; \
  fi

# Copy the rest of the application code
COPY . .

# Disable Next.js telemetry during the build phase
# (Optional, but good for privacy and reduces build output clutter)
ENV NEXT_TELEMETRY_DISABLED 1

# Build the Next.js application for production
# This command relies on 'output: standalone' in next.config.js
RUN npm run build

# Stage 2: Create the lean production image
FROM node:20-alpine AS runner

# Set working directory for the runtime environment
WORKDIR /app

# Set production environment for Node.js
ENV NODE_ENV production

# Disable Next.js telemetry during runtime
ENV NEXT_TELEMETRY_DISABLED 1

# Install necessary tools for the migrate.sh script:
# - mysql-client: Provides the 'mysql' command to interact with the database.
# - bash: Needed for wait-for-it.sh and general shell scripting if /bin/sh isn't sufficient.
# - openssl: Often a dependency for various Node.js modules, good to have.
RUN apk add --no-cache mysql-client bash openssl

# Add a non-root user for security best practices.
# Next.js officially recommends running as a non-root user.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Copy the built Next.js application from the builder stage.
# The 'standalone' output contains the minimal Node.js server.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy public assets (images, static files)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copy static build assets (.next/static)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the migration script and the SQL schema file into the container.
COPY --chown=nextjs:nodejs migrate.sh /app/migrate.sh
COPY --chown=nextjs:nodejs schema.sql /app/schema.sql

# Make the migration script executable
RUN chmod +x /app/migrate.sh

# Download the wait-for-it.sh utility and make it executable.
# It's a simple shell script for waiting on services.
RUN wget -q https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh -O /usr/bin/wait-for-it.sh && \
    chmod +x /usr/bin/wait-for-it.sh

# Expose the port Next.js listens on (default is 3000)
EXPOSE 3000

# Set the entrypoint for the container to execute the migration script.
# This script will then call 'node server.js' after migrations are complete.
CMD ["/app/migrate.sh"]