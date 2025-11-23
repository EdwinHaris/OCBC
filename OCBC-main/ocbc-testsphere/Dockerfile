# FROM mcr.microsoft.com/playwright:v1.47.0-jammy
# WORKDIR /app
# COPY package*.json ./
# RUN npm ci
# COPY . .
# EXPOSE 8080
# CMD ["node", "server.js"]


# Playwright image with Chromium + Firefox + WebKit built-in
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

# App directory inside Docker
WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm ci

# Copy everything else (server.js, ocbc-demo, web, etc.)
COPY . .

# Railway provides PORT — your server must use process.env.PORT
ENV PORT=8080
EXPOSE 8080

# Start your TestSphere backend
CMD ["npm", "start"]
