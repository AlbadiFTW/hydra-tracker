# GitHub Setup Guide

## Prerequisites

### 1. Install Git
Download and install Git from: https://git-scm.com/download/win

During installation:
- ✅ Use default options
- ✅ Select "Git from the command line and also from 3rd party software"
- ✅ Choose your preferred editor
- ✅ Choose "Let Git decide" for line endings

After installation, **restart your terminal/PowerShell**.

### 2. Create GitHub Account
If you don't have one: https://github.com/signup

## Step-by-Step Setup

### Step 1: Verify Git Installation
```powershell
git --version
```

### Step 2: Configure Git (first time only)
```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Step 3: Initialize Repository
```powershell
cd C:\Users\Admin\Documents\Projects\hydra-tracker
git init
git add .
git commit -m "Initial commit: Resident Evil-themed water tracker"
```

### Step 4: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `hydra-tracker` (or any name you prefer)
3. Description: "Resident Evil-themed water intake tracker built with Tauri"
4. **Select: Private** (if you want to keep it private) or **Public** (if you want to share)
5. **DO NOT** check "Initialize with README" (we already have one)
6. Click **"Create repository"**

### Step 5: Link and Push to GitHub

GitHub will show you commands. Use these (replace `YOUR_USERNAME` with your GitHub username):

```powershell
git remote add origin https://github.com/YOUR_USERNAME/hydra-tracker.git
git branch -M main
git push -u origin main
```

You'll be prompted for your GitHub username and password. For password, use a **Personal Access Token** (not your account password):

#### Create Personal Access Token:
1. Go to https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Name it: "Hydra Tracker Upload"
4. Select scopes: ✅ `repo` (full control of private repositories)
5. Click **"Generate token"**
6. **COPY THE TOKEN** (you won't see it again!)
7. Use this token as your password when pushing

### Step 6: Create a Release with Installer

1. Go to your repository on GitHub: `https://github.com/YOUR_USERNAME/hydra-tracker`
2. Click **"Releases"** → **"Create a new release"**
3. Tag version: `v1.0.0`
4. Release title: `v1.0.0 - Initial Release`
5. Description:
   ```
   🧬 First release of Hydra Tracker!
   
   Features:
   - Resident Evil-themed UI
   - Daily water intake tracking
   - Smart reminders
   - Monthly analytics
   - System tray integration
   ```
6. **Attach installer files:**
   - Drag and drop these files:
     - `src-tauri\target\release\bundle\nsis\Hydra Tracker_1.0.0_x64-setup.exe`
     - `src-tauri\target\release\bundle\msi\Hydra Tracker_1.0.0_x64_en-US.msi`
   - Or click "Attach binaries" and select them
7. Click **"Publish release"**

### Step 7: Update README with Download Link

After creating the release, update the README to include:
- Download link to the latest release
- Installation instructions

## Quick Commands Reference

```powershell
# Check status
git status

# Add all changes
git add .

# Commit changes
git commit -m "Your commit message"

# Push to GitHub
git push

# Pull latest changes
git pull
```

## Need Help?

- Git documentation: https://git-scm.com/doc
- GitHub guides: https://guides.github.com
