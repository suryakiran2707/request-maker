#!/bin/bash

# Install Node packages
echo "Installing dependencies..."
npm install

# Install Playwright browsers with dependencies
echo "Installing Playwright browsers..."
npx playwright install --with-deps
