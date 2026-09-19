# Deploying SafeBand to Netlify 🚀

Your frontend is fully configured and optimized for Netlify deployment with Single-Page Application (SPA) routing rules (`_redirects` and `netlify.toml`) already in place.

---

## Method 1: Instant Drag & Drop (Fastest — 1 Minute)

You don't even need git setup to deploy right now:

1. Open your browser and visit: **[https://app.netlify.com/drop](https://app.netlify.com/drop)** (log in or sign up for a free Netlify account).
2. On your computer, navigate to:
   ```
   c:\Users\DELL\Downloads\safeband\safeband\frontend\dist
   ```
3. Drag and drop the **`dist`** folder directly into the Netlify Drop area in your browser.
4. Netlify will upload and publish your site in seconds! You will receive a live URL like `https://peaceful-sunset-xxxxxx.netlify.app`.

---

## Method 2: Connect via GitHub (Automatic Updates on Push)

If you keep your code in a GitHub repository:

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "feat: real-time location detection & Netlify setup"
   git push origin main
   ```
2. In the [Netlify Dashboard](https://app.netlify.com/):
   - Click **Add new site** > **Import an existing project**.
   - Select **GitHub** and choose your repository.
3. Netlify will automatically read the included `netlify.toml`:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist` (or `frontend/dist`)
4. Click **Deploy site**. Every future git push will automatically re-deploy!

---

## Method 3: Deploy via Netlify CLI

In PowerShell / Terminal:
```bash
cd frontend
npx netlify-cli login
npx netlify-cli deploy --prod --dir=dist
```

---

## Connecting Frontend to Your Backend API

When your backend is hosted (e.g. on Render, Railway, Fly.io, or AWS):
1. In the Netlify Dashboard, go to **Site configuration** > **Environment variables**.
2. Add a new variable:
   - **Key**: `VITE_API_URL`
   - **Value**: `https://your-backend-url/api` (e.g. `https://safeband-api.onrender.com/api`)
3. Trigger a re-deploy (or run `npm run build` and re-upload `dist`).
