# 🧬 Hydra Tracker

A Resident Evil-themed, lightweight desktop water intake reminder and tracker built with Tauri + React.

![Hydra Tracker](https://img.shields.io/badge/RAM-~15MB-green) ![Tauri](https://img.shields.io/badge/Tauri-2.0-blue) ![Platform](https://img.shields.io/badge/Platform-Windows%20|%20macOS%20|%20Linux-lightgrey)

## Features

### Core Features
- 🎯 **Daily Goal Tracking** - Set your personal hydration goal (default: 4L)
- ⚡ **Quick Add Buttons** - One-click logging for common amounts (250ml, 500ml, 750ml, 1L)
- 📝 **Custom Amounts** - Log any custom water amount
- 🔔 **Smart Reminders** - Customizable reminder intervals (default: every hour)
- 📊 **Monthly Analytics** - Visualize your hydration trends with charts
- 🔥 **Streak Tracking** - Stay motivated with consecutive day streaks

### Additional Features
- 🖥️ **System Tray** - Minimizes to tray, always accessible
- 🎨 **Dark/Light Theme** - Easy on the eyes during day or night
- 💾 **Local Storage** - All data stored locally in SQLite
- 🚀 **Auto-start** - Option to launch with system startup
- 📱 **Responsive** - Clean UI that works at any size

## Why Tauri?

Unlike Electron apps that bundle an entire Chromium browser (~150-300MB RAM), Tauri uses your system's native WebView:

| Metric | Electron | Tauri |
|--------|----------|-------|
| RAM Usage | 150-300 MB | 10-20 MB |
| Binary Size | 150+ MB | 5-10 MB |
| Startup Time | 2-5 seconds | <1 second |

Perfect for keeping open while gaming or coding!

## Prerequisites

Before building, you need:

### Windows
1. **Microsoft C++ Build Tools**
   - Download from [Visual Studio Downloads](https://visualstudio.microsoft.com/downloads/)
   - Select "Desktop development with C++"

2. **WebView2**
   - Usually pre-installed on Windows 10/11
   - If not: [Download WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

3. **Rust**
   ```powershell
   # Install via rustup
   winget install Rustlang.Rustup
   # Or download from https://rustup.rs
   ```

### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Linux (Ubuntu/Debian)
```bash
# Install system dependencies
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Installation

1. **Clone and install dependencies**
   ```bash
   cd hydra-tracker
   npm install
   ```

2. **Generate app icons** (required for building)
   ```bash
   # You can use any 1024x1024 PNG as source
   # Place it at src-tauri/icons/icon.png
   # Then use Tauri's icon generator:
   npm run tauri icon src-tauri/icons/icon.png
   ```

   Or create placeholder icons manually:
   ```bash
   # On Linux/macOS with ImageMagick:
   convert -size 32x32 xc:"#3b82f6" src-tauri/icons/32x32.png
   convert -size 128x128 xc:"#3b82f6" src-tauri/icons/128x128.png
   convert -size 256x256 xc:"#3b82f6" src-tauri/icons/128x128@2x.png
   cp src-tauri/icons/128x128.png src-tauri/icons/icon.icns
   cp src-tauri/icons/128x128.png src-tauri/icons/icon.ico
   cp src-tauri/icons/32x32.png src-tauri/icons/tray.png
   ```

3. **Development mode**
   ```bash
   npm run tauri dev
   ```

4. **Build for production**
   ```bash
   npm run tauri build
   ```

   Builds will be in `src-tauri/target/release/bundle/`

## Usage

### Quick Actions
- **Click quick add buttons** to log common amounts instantly
- **Type custom amount** and press Enter or click Add
- **Right-click system tray icon** for quick-add options
- **Click the X** to minimize to tray (app keeps running)

### Settings
- **Daily Goal**: Set your target water intake (ml)
- **Reminder Interval**: How often to get hydration reminders (minutes)
- **Enable Reminders**: Toggle notifications on/off
- **Sound**: Enable/disable notification sounds
- **Theme**: Switch between dark and light modes
- **Start with System**: Auto-launch on login

### Analytics
- View daily intake as a bar chart
- Track total monthly consumption
- See your daily average
- Count how many days you hit your goal
- Monitor your current streak

## Data Storage

All data is stored locally:
- **Windows**: `%APPDATA%\com.hydra.tracker\hydra.db`
- **macOS**: `~/Library/Application Support/com.hydra.tracker/hydra.db`
- **Linux**: `~/.local/share/com.hydra.tracker/hydra.db`

## Customization

### Changing Default Goal
Edit `src-tauri/src/lib.rs`:
```rust
impl Default for Settings {
    fn default() -> Self {
        Self {
            daily_goal_ml: 4000,  // Change this value
            // ...
        }
    }
}
```

### Adding Quick Add Buttons
Edit `src/App.tsx`:
```typescript
const quickAmounts = [250, 500, 750, 1000];  // Add or change values
```

### Changing Theme Colors
Edit `src/index.css` and modify the CSS variables in `:root`

## Troubleshooting

### "WebView2 not found" (Windows)
Download and install [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### Notifications not working
- Ensure notifications are enabled in system settings
- Grant notification permission when prompted
- Check "Do Not Disturb" mode is off

### High memory usage
This shouldn't happen with Tauri, but if it does:
- Check for memory leaks in dev tools (F12)
- Restart the app
- Report an issue with system specs

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Rust + Tauri 2.0
- **Database**: SQLite (via rusqlite)
- **Charts**: Recharts
- **Styling**: Custom CSS (no framework bloat)

## License

MIT License - feel free to use, modify, and distribute!

---

Made with 💧 by Abdulrahman | Stay hydrated!
