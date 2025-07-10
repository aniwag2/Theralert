# Stage 1: Install dependencies and build the Next.js application
FROM node:20-alpine AS builder

# Set working directory inside the container
WORKDIR /app

# Copy package.json and lock files
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Install dependencies based on lock file presence
RUN \
  if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
  elif [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
  else npm install --frozen-lockfile; \
  fi

# Copy the rest of the application code
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

# Build the Next.js application for production
RUN npm run build

# Stage 2: Create the lean production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Install necessary tools as root
# CHANGE: Use mariadb-client instead of mysql-client
RUN apk add --no-cache mariadb-client bash openssl

# Download wait-for-it.sh and make it executable AS ROOT
# This step must come *before* switching to the 'nextjs' user
RUN wget -q https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh -O /usr/bin/wait-for-it.sh && \
    chmod +x /usr/bin/wait-for-it.sh

# Now create the non-root user and switch to it
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Copy the built Next.js application from the builder stage with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the migration script and the SQL schema file with correct ownership
COPY --chown=nextjs:nodejs migrate.sh /app/migrate.sh
COPY --chown=nextjs:nodejs schema.sql /app/schema.sql

# Make the migration script executable (already owned by nextjs, so this is fine)
RUN chmod +x /app/migrate.sh

EXPOSE 3000

CMD ["/app/migrate.sh"]