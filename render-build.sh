#!/bin/bash

# Just install Playwright browsers with dependencies
# The npm install part is now handled by nixpacks.toml
echo "Installing Playwright browsers..."
npx playwright install --with-deps
