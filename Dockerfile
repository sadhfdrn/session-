# Use Node 18 with Debian base for better Chromium compatibility
FROM node:18-bullseye-slim

# Install system dependencies including Chrome/Chromium
RUN apt-get update && apt-get install -y \
    # Chrome dependencies
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    # Core dependencies
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    # Additional dependencies
    libxshmfence1 \
    libglu1-mesa \
    libgbm1 \
    # Font support
    fonts-liberation \
    fonts-roboto \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    # Utils
    curl \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Create a user to run Chromium (security best practice)
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads /app \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /app

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Create required directories and set permissions
RUN mkdir -p tokens public && chown -R pptruser:pptruser tokens public

# Create the public directory structure and copy frontend
RUN mkdir -p public
COPY index.html public/index.html

# Ensure proper permissions for all files
RUN chown -R pptruser:pptruser /app

# Switch to non-root user
USER pptruser

# Set environment variables for optimal Chrome execution
ENV CHROME_BIN=/usr/bin/google-chrome-stable
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production
ENV DISPLAY=:99

# Expose port
EXPOSE 3000

# Health check with increased timeout
HEALTHCHECK --interval=45s --timeout=45s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]