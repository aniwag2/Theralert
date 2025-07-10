# Stage 1: Install dependencies and build the application
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and lock files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1

# Build the Next.js application
# The `output: 'standalone'` in next.config.js will create the .next/standalone folder
RUN npm run build

# Stage 2: Create the production image
FROM node:20-alpine AS runner

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1 # Disable telemetry in runtime too

# Add a non-root user for security
# Next.js recommends running as a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Copy the standalone output, public, and static files
# The `standalone` output doesn't copy public or .next/static by default,
# as these are often served by a CDN, but for self-hosting, we copy them manually.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Expose the port Next.js listens on (default is 3000)
EXPOSE 3000

# Command to run the Next.js server
# next start cannot be used with output: 'standalone'
CMD ["node", "server.js"]