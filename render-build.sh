#!/bin/bash

# Remove yarn.lock to avoid issues with private registry
echo "Removing yarn.lock file..."
rm -f yarn.lock

# Configure npm to use the public registry
echo "Configuring npm to use public registry..."
npm config set registry https://registry.npmjs.org/

# Install Node packages using npm (not yarn)
echo "Installing dependencies with npm..."
npm install

# Install Playwright browsers with dependencies
echo "Installing Playwright browsers..."
npx playwright install --with-deps
