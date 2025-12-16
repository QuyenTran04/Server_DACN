# Use Node.js runtime
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy source code with proper permissions
COPY --chown=nodejs:nodejs . .

# Create uploads directory and set permissions
RUN mkdir -p uploads && chown -R nodejs:nodejs uploads

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production

# Expose port
EXPOSE 5000

# Health check (optional - remove if you don't have a health endpoint)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))" || true

# Start the app with proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
