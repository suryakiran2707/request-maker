import { chromium } from 'playwright';
import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const productAlias = 'amul-high-protein-milk-250-ml-or-pack-of-32';
const productUrl = `https://shop.amul.com/en/product/${productAlias}`;
const apiPattern = '/api/1/entity/ms.products?fields';
const userPincode = '500084'; // Telangana / Hyderabad

// Store global variables
const __dirname = dirname(fileURLToPath(import.meta.url));
const responsesDir = join(__dirname, 'responses');
let runCount = 0;

// Create the initial responses directory
await mkdir(responsesDir, { recursive: true }).catch(() => {});

// Delete previous files on startup
const cleanupFiles = async () => {
  try {
    const files = await readdir(responsesDir);
    console.log(`Found ${files.length} previous response files, deleting...`);
    for (const file of files) {
      await unlink(join(responsesDir, file));
    }
    if (files.length > 0) {
      console.log(`\u2705 Deleted ${files.length} previous response files`);
    }
  } catch (error) {
    // If directory doesn't exist or is empty, just continue
    console.log('No previous files to delete');
  }
};

// Main function to run the process
async function runCheckProcess() {
  runCount++;
  const startTime = new Date();
  console.log(`\n=== Starting run #${runCount} at ${startTime.toLocaleTimeString()} ===`);
  
  // Clean up files before each run
  console.log('Cleaning up previous files...');
  await cleanupFiles();

  // Check if we're running on Railway/Render to determine headless mode
  const isProduction = process.env.RAILWAY_ENVIRONMENT || process.env.RENDER;
  console.log(`Running in ${isProduction ? 'production (headless)' : 'development (non-headless)'} mode`);
  
  const browser = await chromium.launch({ 
    headless: isProduction ? true : false,
    args: isProduction ? ['--no-sandbox'] : [] // Additional args for containerized environments
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Hide webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Log product API responses
  let count = 0;
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes(apiPattern)) {
      count++;
      console.log(`\n[#${count}] ${response.status()} ${url}`);
      try {
        const json = await response.json();
        
        // Extract only the needed data
        let extractedData = {};
        
        // Check if we have data and items in the response
        if (json && json.data) {
          const items = json.data;
          
          // Create an array to store simplified item data
          extractedData = items.map(item => {
            return {
              alias: item.alias, // Using the URL alias as identifier
              inventory_quantity: item.inventory_quantity || 0,
              name: item.name || 'Unknown',
              timestamp: new Date().toISOString()
            };
          });
        } else {
          // If structure is different, save a simplified empty object
          extractedData = {
            alias: productAlias,
            inventory_quantity: 'not found in response',
            timestamp: new Date().toISOString(),
            error: 'Expected data structure not found'
          };
        }
        
        // Create filename with timestamp and counter
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `response_${count}_${timestamp}.json`;
        
        // Get current directory
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const filePath = join(__dirname, 'responses', filename);
        
        // Write simplified JSON to file
        await writeFile(filePath, JSON.stringify(extractedData, null, 2));
        console.log(`  ✅ Saved inventory data to: ${filename}`);
        console.log(`  Inventory quantity: ${JSON.stringify(extractedData)}`);
        console.log('next one started');
      } catch (error) {
        console.log('  (non‑JSON or parse error)');
      }
    }
  });

  console.log('→ Opening product page...');
  await page.goto(productUrl, { waitUntil: 'load' });

  // ⏳ Wait for pincode popup/input
  try {
    await page.waitForSelector('input[placeholder="Enter Your Pincode"]', { timeout: 10000 });
    console.log('→ Pincode input detected, filling...');
    await page.fill('input[placeholder="Enter Your Pincode"]', userPincode);

    // 2. Wait for the suggestion dropdown to show
    await page.waitForSelector('.list-group-item', { timeout: 5000 });

    // 3. Click the first suggestion (safe to use the <a> inside)
    await page.click('.list-group-item a.searchitem-name');

    // Wait for reload or redirect
    await page.waitForLoadState('networkidle');
    console.log('✅ Pincode submitted, page reloaded');
  } catch (err) {
    console.log('⚠️ Pincode input not detected — maybe already set or site changed');
  }

  // Scroll to trigger lazy load
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let total = 0, distance = 200;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        total += distance;
        if (total >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });

  await page.waitForTimeout(5000);
  console.log(`\n✅ Done: captured ${count} API response(s).`);

  await browser.close();
  
  const endTime = new Date();
  const duration = (endTime - startTime) / 1000;
  console.log(`=== Finished run #${runCount} at ${endTime.toLocaleTimeString()} (took ${duration.toFixed(1)}s) ===`);
  console.log(`Next run scheduled in 3 minutes.`);
}

// Start the first run immediately
await runCheckProcess();

// Then schedule it to run every 3 minutes
console.log('Scheduled to run every 3 minutes. Press Ctrl+C to stop.');
setInterval(runCheckProcess, 3 * 60 * 1000); // 3 minutes in milliseconds
