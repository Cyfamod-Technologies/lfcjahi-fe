# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_BACKEND_URL
# NEXT_PUBLIC_BACKEND_URL remains supported for older deployment configuration.
RUN NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-$NEXT_PUBLIC_BACKEND_URL}" npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
