FROM node:20-alpine

WORKDIR /app

# Copy root package files for workspaces
COPY package*.json ./

# Copy backend, frontend, and shared-schemas package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY shared-schemas/package*.json ./shared-schemas/

# Install all dependencies (workspaces will handle both backend and frontend)
RUN npm ci --production=false

# Copy source code
COPY . .

# Build arguments for Vite environment variables
ARG VITE_API_BASE_URL

# Build frontend with the API URL baked in
RUN npm run build

# Expose ports
EXPOSE 7130 7131

# Run migrations and start the backend application
CMD sh -c "cd backend && npm run migrate:up && cd .. && npm start"