import express from 'express';
import { readdir, readFile, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Configuration
const PORT = process.env.PORT || 3001; // Use environment PORT or default to 3001
const __dirname = dirname(fileURLToPath(import.meta.url));
const responsesDir = join(__dirname, 'responses');

// Sample data to use when deployed (when no response files are available)
const SAMPLE_DATA = [
  {
    alias: 'amul-high-protein-milk-250-ml-or-pack-of-32',
    inventory_quantity: 0,
    name: 'Amul High Protein Milk, 250 mL | Pack of 32',
    timestamp: new Date().toISOString()
  }
];

// Check if we're running on Render
const isRunningOnRender = process.env.RENDER === 'true';

// Create Express app
const app = express();

// Middleware
app.use(express.json());

// API Endpoints

// Debug endpoint to check if API is working
app.get('/', (req, res) => {
  res.send('API Server is running. Try <a href="/api/inventory">/api/inventory</a> endpoint.');
});

// Debug endpoint to check directories and files
app.get('/api/debug', async (req, res) => {
  try {
    // Check if responses directory exists
    const dirExists = await stat(responsesDir).then(() => true).catch(() => false);
    res.json({ responsesDirExists: dirExists });
  } catch (error) {
    console.error('Error fetching debug information:', error);
    return res.status(500).json({ error: 'Failed to fetch debug information' });
  }
});

// GET /api/inventory - Get all inventory data, grouped by product alias
app.get('/api/inventory', async (req, res) => {
  console.log('GET /api/inventory - Request received');
  try {
    let allData = [];
    
    // Try to read from response files
    try {
      // Check if responses directory exists and has files
      const files = await readdir(responsesDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      if (jsonFiles.length > 0) {
        // Read and parse each JSON file
        for (const file of jsonFiles) {
          const filePath = join(responsesDir, file);
          const content = await readFile(filePath, 'utf8');
          try {
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
              allData.push(...data);
            } else {
              allData.push(data);
            }
          } catch (error) {
            console.error(`Error parsing ${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log('Could not access response files:', error.message);
    }
    
    // If no data was found from files or we're on Render, use sample data
    if (allData.length === 0 || isRunningOnRender) {
      console.log('Using sample data for inventory');
      allData = [...SAMPLE_DATA];
    }

    // Keep only one entry per alias, ignoring duplicates
    const uniqueAliasMap = new Map();
    
    // Sort all data by timestamp (newest first) before processing
    allData.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    
    // Keep only the first (newest) occurrence of each alias
    allData.forEach(item => {
      if (!item.alias) return; // Skip items without an alias
      
      if (!uniqueAliasMap.has(item.alias)) {
        uniqueAliasMap.set(item.alias, item);
      }
      // If we've already seen this alias, ignore this item
    });
    
    // Convert the map to an array of items
    const uniqueItems = Array.from(uniqueAliasMap.values());

    return res.json({
      timestamp: new Date().toISOString(),
      totalProducts: uniqueItems.length,
      products: uniqueItems
    });
  } catch (error) {
    console.error('Error fetching inventory data:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch inventory data',
      message: error.message,
      stack: error.stack
    });
  }
});

// GET /api/inventory/:alias - Get inventory data for a specific product
app.get('/api/inventory/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    let productData = [];
    
    // Try to read from response files
    try {
      // Check if responses directory exists and has files
      const files = await readdir(responsesDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      if (jsonFiles.length > 0) {
        // Read and parse each JSON file
        for (const file of jsonFiles) {
          const filePath = join(responsesDir, file);
          const content = await readFile(filePath, 'utf8');
          try {
            const data = JSON.parse(content);
            const items = Array.isArray(data) ? data : [data];
            const matchingItems = items.filter(item => item.alias === alias);
            productData.push(...matchingItems);
          } catch (error) {
            console.error(`Error parsing ${file}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log('Could not access response files:', error.message);
    }
    
    // If no data was found or we're on Render, use sample data
    if (productData.length === 0 || isRunningOnRender) {
      const sampleItem = SAMPLE_DATA.find(item => item.alias === alias);
      if (sampleItem) {
        console.log('Using sample data for product:', alias);
        productData = [sampleItem];
      }
    }
    
    if (productData.length === 0) {
      return res.status(404).json({ error: `No data found for product: ${alias}` });
    }
    
    // Sort by timestamp (newest first) and keep only the most recent one
    productData.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    
    // Get the most recent product data
    const mostRecentData = productData.length > 0 ? productData[0] : null;
    
    if (!mostRecentData) {
      return res.status(404).json({ error: `No data found for product: ${alias}` });
    }
    
    return res.json({
      timestamp: new Date().toISOString(),
      product: mostRecentData
    });
  } catch (error) {
    console.error('Error fetching product data:', error);
    return res.status(500).json({ error: 'Failed to fetch product data' });
  }
});

// Handle uncaught errors to keep server running
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server with improved error handling
const server = app.listen(PORT, () => {
  console.log(`\u2705 API Server running at http://localhost:${PORT}`);
  console.log(`Available endpoints:`);
  console.log(`  GET /api/inventory - All inventory data grouped by product`);
  console.log(`  GET /api/inventory/:alias - Data for a specific product`);
  console.log(`  GET /api/debug - Debug information about the responses directory`);
  console.log(`\nServer is now listening continuously. Press Ctrl+C to stop.`);
});

// Add error handler for the server
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please try a different port.`);
    process.exit(1);
  } else {
    console.error('Server error:', e);
  }
});

// Keep the Node.js process running
setInterval(() => {
  // This empty interval keeps the Node.js event loop active
}, 60000);
