# Request Maker API

A simple API server that collects and provides inventory data for products.

## Endpoints

- `GET /` - Basic health check
- `GET /api/inventory` - Get all inventory data
- `GET /api/inventory/:alias` - Get data for a specific product by alias
- `GET /api/debug` - Debug information about the responses directory

## Local Development

```bash
# Run the data collector
npm run dev

# Run the API server
npm run api
```

## Deployment

This API is designed to be deployed on Render.com.

### Deploying to Render

1. Create a new account on [Render](https://render.com/) if you don't have one
2. From the Render dashboard, click on "New" and select "Web Service"
3. Connect your GitHub repository or use the manual deploy option
4. Configure your service with the following settings:
   - **Name**: request-maker (or your preferred name)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add the following environment variables:
   - `RENDER=true`
   - `PORT=3000` (Render will automatically assign the actual port)
6. Click "Create Web Service"

Alternatively, you can use the included `render.yaml` file for deployment:

```bash
# Install the Render CLI if you don't have it
npm install -g @render/cli

# Deploy using the render.yaml configuration
render deploy
```
