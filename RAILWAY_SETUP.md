# Railway Deployment Guide

This guide walks you through deploying the Alux Plaza backend to [Railway.app](https://railway.app).

## Prerequisites

- Railway account (free tier available at https://railway.app)
- GitHub account with access to this repository
- A Railway API token (for CI/CD automation)

## Step 1: Create a Railway Project

1. Go to [railway.app](https://railway.app) and log in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select the `sybertoooth7-lgtm/jinarous` repository
4. Choose to deploy the entire repo (Railway will auto-detect the Node backend)

## Step 2: Configure Environment Variables

In your Railway project dashboard:

1. Go to the **Variables** section
2. Add the following variables from `backend/.env.example`:

   ```
   PORT=8080
   NODE_ENV=production
   CORS_ORIGIN=https://your-frontend-domain.com
   DB_PATH=/app/data/alux.db
   JWT_SECRET=<generate-a-long-random-string>
   JWT_EXPIRES_IN=8h
   CONTACT_RATE_LIMIT_WINDOW_MINUTES=15
   CONTACT_RATE_LIMIT_MAX=5
   LOG_LEVEL=info
   SENTRY_DSN=<optional>
   ALERT_WEBHOOK_URL=<optional>
   ```

3. Generate a strong `JWT_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

## Step 3: Set Up Persistent Storage

Railway by default uses ephemeral storage. To persist your SQLite database:

1. In the Railway dashboard, go to **Environment** → **Storage**
2. Add a new volume mount:
   - Mount path: `/app/data`
   - Size: 1GB (or as needed)
3. This ensures your database persists across deployments

## Step 4: Deploy

Railway will automatically deploy when you:
- Push to `main` branch with changes in the `backend/` directory
- Or manually trigger a deployment from the Railway dashboard

Monitor deployment status in Railway's **Deployment** tab.

## Step 5: Run Admin Setup

Once deployed, create your admin account:

1. In Railway, open the **Shell** tab for your service
2. Run:
   ```bash
   npm run create-admin
   ```
3. Follow the prompts to set your admin email and password

## Step 6: Get Your Deployed URL

1. In Railway, go to **Networking**
2. Copy your public URL (e.g., `https://jinarous-production.up.railway.app`)
3. Update your frontend's `VITE_API_BASE_URL` to this URL
4. Add this URL to `CORS_ORIGIN` in Railway variables if not already set

## Step 7: Connect Frontend

In your frontend `.env`:

```bash
VITE_API_BASE_URL=https://jinarous-production.up.railway.app
```

Then rebuild and deploy your frontend.

## Step 8: Set Up GitHub Actions (Optional - Automatic Deployments)

To enable automatic deployments on every push:

1. Generate a Railway API token:
   - Go to Railway → **Account Settings** → **API Tokens**
   - Create a new token and copy it

2. In your GitHub repo, go to **Settings** → **Secrets and variables** → **Actions**
3. Add a new secret:
   - Name: `RAILWAY_TOKEN`
   - Value: Your Railway API token

4. The workflow (`.github/workflows/deploy-backend.yml`) will now automatically deploy on `main` branch pushes to the `backend/` directory

## Monitoring

Railway provides built-in monitoring:

- **Logs**: Real-time logs visible in the Railway dashboard
- **Health Checks**: Point the `/api/health/deep` endpoint to an uptime monitor
- **Metrics**: CPU, memory, and request metrics in the dashboard

## Troubleshooting

### Database not persisting
- Ensure the volume mount is correctly set to `/app/data`
- Check `DB_PATH` environment variable matches the mount path

### CORS errors on frontend
- Verify `CORS_ORIGIN` includes your frontend's exact domain
- Ensure the frontend's `VITE_API_BASE_URL` points to the Railway URL

### Admin login not working
- Ensure you ran `npm run create-admin` after deployment
- Check the Railway shell for any error messages

### Port issues
- Railway automatically assigns a port; use `process.env.PORT` (set to 8080 by default)
- The app listens on the Railway-assigned port, not hardcoded 4000

## Next Steps

- Set up monitoring with Sentry (optional) for error tracking
- Add Slack/Discord alerts via `ALERT_WEBHOOK_URL`
- Configure a custom domain in Railway's **Networking** settings
- Set up CI/CD for the frontend as well

For more help, see the [Railway documentation](https://docs.railway.app).
