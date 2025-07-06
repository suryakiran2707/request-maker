import { chromium } from 'playwright';
import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const productAlias = 'amul-high-protein-milk-250-ml-or-pack-of-32';
const productUrl = `https://shop.amul.com/en/product/${productAlias}`;
const apiPattern = '/api/1/entity/ms.products?fields';
const userPincode = '500084'; // Telangana / Hyderabad
let prevData = [];
let currData = [];

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
  currData = [];

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
        currData.push(...extractedData);
      } catch (error) {
        console.log(`  ❌ error: ${error.message}`);
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

  // Wait longer for the page to stabilize after pincode submission
  console.log('Waiting for page to stabilize...');
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(err => {
    console.log('Network not fully idle, but continuing...');
  });
  
  // Scroll to trigger lazy load with better error handling
  console.log('Starting scroll action...');
  try {
    // Use a simpler scrolling approach that's less likely to break
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      }).catch(err => console.log('Scroll step had an issue, continuing...'));
      
      // Small pause between scrolls
      await page.waitForTimeout(500);
    }
    console.log('Scrolling completed successfully');
  } catch (err) {
    console.log('Error during scrolling, but continuing:', err.message);
  }
  
  // Wait a bit more after scrolling
  await page.waitForTimeout(5000);
  console.log(`\n✅ Done: captured ${count} API response(s).`);

  await browser.close();
  
  const endTime = new Date();
  const duration = (endTime - startTime) / 1000;

  if (prevData.length > 0) {
    compareAndSendSMS(currData, prevData);
  } else {
    sendSMS('+918688288381', `Application is active`);
  }
  prevData = currData;
  console.log(`=== Finished run #${runCount} at ${endTime.toLocaleTimeString()} (took ${duration.toFixed(1)}s) ===`);
  console.log(`Next run scheduled in 3 minutes.`);
}

// Wrapper function to prevent crashes
async function safeRunCheckProcess() {
  try {
    await runCheckProcess();
  } catch (error) {
    console.error(`\n❌ Error in runCheckProcess: ${error.message}`);
    console.error('Process will retry at next scheduled interval');
  }
}

async function compareAndSendSMS(newData, prevData) {
  console.log('Comparing new data with previous data...');
  console.log('New data:', newData);
  console.log('Previous data:', prevData);
  var prevDataMap = new Map();
  prevData.forEach(item => {
    prevDataMap.set(item.alias, item);
  });
  newData.forEach(item => {
    if (prevDataMap.get(item.alias)?.inventory_quantity === 0 && item.inventory_quantity > 0) {
      sendSMS('+918688288381', `Product ${item.name} is back in stock!`);
    }
  });
}

async function sendSMS(to, message) {
  try {
    // Make sure the "from" number is a Twilio-provided phone number
    if (!process.env.TWILIO_PHONE.startsWith('+')) {
      console.error('❌ TWILIO_PHONE must start with + followed by country code (e.g., +1xxxxxxxxxx)');
      return;
    }
    
    var res = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to: to,
    });

    console.log('✅ SMS sent:', res.sid);
  } catch (err) {
    console.error('❌ Failed to send SMS:', err.message);
  }
}

// Start the first run immediately with error handling
try {
  await safeRunCheckProcess();
} catch (error) {
  console.error(`\n❌ Fatal error in first run: ${error.message}`);
}

// Then schedule it to run every 3 minutes with error handling
console.log('Scheduled to run every 3 minutes. Press Ctrl+C to stop.');
setInterval(safeRunCheckProcess, 60 * 1000); // 3 minutes in milliseconds
