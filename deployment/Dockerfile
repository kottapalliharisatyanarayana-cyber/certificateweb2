# Production Dockerfile for Certificate Generation System
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy application folders
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY api/ ./api/
COPY uploads/ ./uploads/

# Expose port (default 3000, customizable via PORT env)
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Start server
CMD ["node", "backend/app.js"]
