#!/bin/bash

# Configure npm to use the public registry
echo "Configuring npm to use public registry..."
npm config set registry https://registry.npmjs.org/

# Install Node packages
echo "Installing dependencies..."
npm install --no-save

# Install Playwright browsers with dependencies
echo "Installing Playwright browsers..."
npx playwright install --with-deps
