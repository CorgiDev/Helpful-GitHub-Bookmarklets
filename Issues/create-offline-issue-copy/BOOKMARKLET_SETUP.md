# GitHub Offline Issue Copy - Bookmarklet Refactor

## Overview

The original bookmarklet has grown too large to fit within JavaScript bookmarklet size limits (typically ~40KB in Chrome and Edge). This refactored version splits the code into:

1. **`create-offline-issue-copy-standalone.js`** - The full, unminified script (user-friendly for editing)
2. **`create-offline-issue-copy-bookmarklet.js`** - A minimal loader that fetches and executes the standalone script

## Quick Start

### Option 1: Use jsDelivr CDN (Recommended)

1. Ensure this repository is **public**
2. Create a new bookmark in your browser with this code as the URL:

```javascript
javascript:(async()=>{const e=new URL("https://cdn.jsdelivr.net/gh/CorgiDev/Helpful-GitHub-Bookmarklets@main/Issues/create-offline-issue-copy/create-offline-issue-copy-standalone.js");try{const t=await fetch(e);if(!t.ok)throw new Error(`Failed to load script (${t.status})`);const r=await t.text(),n=document.createElement("script");n.type="module",n.textContent=r,document.head.appendChild(n)}catch(t){alert(`Error loading bookmarklet: ${t.message}\n\nMake sure the repository is public and try the raw git URL.`)}})();
```

**Note:** The CDN URL will automatically serve the **latest version** from the `main` branch. No manual updates needed!

### Option 2: Use GitHub Pages

If you've enabled GitHub Pages for this repository:

1. Replace the URL in the bookmarklet above with your GitHub Pages URL:
   ```
   https://yourname.github.io/Helpful-GitHub-Bookmarklets/Issues/create-offline-issue-copy/create-offline-issue-copy-standalone.js
   ```

### Option 3: Self-Hosted

Host `create-offline-issue-copy-standalone.js` on your own server and replace the URL in the bookmarklet accordingly.

## How It Works

1. **Click the bookmarklet** on any GitHub issue, PR, or discussion page
2. The bookmarklet fetches `create-offline-issue-copy-standalone.js` from the CDN
3. The script executes and handles the offline export as before
4. No file size limits - the bookmarklet is only ~500 bytes, the rest is loaded dynamically

## File Structure

```
Issues/
└── create-offline-issue-copy/
   ├── create-offline-issue-copy.js (original large file - kept for reference)
   ├── create-offline-issue-copy-standalone.js (full script)
   ├── create-offline-issue-copy-bookmarklet.js (minimal loader)
   └── BOOKMARKLET_SETUP.md (this file)
```

## Benefits of This Approach

✅ **No size limits** - Bookmarklet loader is small, full logic is hosted externally  
✅ **Easier to maintain** - Edit the standalone script without worrying about bookmarklet constraints  
✅ **Auto-updates** - jsDelivr serves the latest version automatically  
✅ **Works in Chrome & Edge** - File System Access API still supported  
✅ **Backward compatible** - Original `.js` file preserved if needed

## Browser Compatibility

- **Chrome** 99+ 
- **Edge** 99+
- **Safari** - Not supported (no File System Access API on desktop Safari)

## Troubleshooting

**Error: "Failed to load script (404)"**
- Ensure the repository is public (Settings → Visibility)
- Check that jsDelivr can cache the branch (may take a few minutes on first use)
- Try using a specific commit hash instead: `https://cdn.jsdelivr.net/gh/CorgiDev/Helpful-GitHub-Bookmarklets@COMMIT_HASH/Issues/create-offline-issue-copy/create-offline-issue-copy-standalone.js`

**Error: "Failed to load script (403)"**
- Repository might be private; jsDelivr cannot serve private repositories
- Use GitHub Pages or self-host instead

**Bookmarklet does nothing**
- Check browser console (F12) for errors
- Verify you're on a GitHub issue/PR/discussion page
- Try reloading the page and trying again

## Customization

To modify the bookmarklet:

1. Edit `create-offline-issue-copy-standalone.js` directly
2. Commit and push to `main`
3. Changes are live immediately (jsDelivr refreshes within minutes)

To use a different version/branch:

```javascript
// Use a specific branch
https://cdn.jsdelivr.net/gh/CorgiDev/Helpful-GitHub-Bookmarklets@your-branch-name/Issues/create-offline-issue-copy/create-offline-issue-copy-standalone.js

// Use a specific tag/release
https://cdn.jsdelivr.net/gh/CorgiDev/Helpful-GitHub-Bookmarklets@v1.0.0/Issues/create-offline-issue-copy/create-offline-issue-copy-standalone.js

// Use a specific commit
https://cdn.jsdelivr.net/gh/CorgiDev/Helpful-GitHub-Bookmarklets@COMMIT_SHA/Issues/create-offline-issue-copy/create-offline-issue-copy-standalone.js
```

## References

- [jsDelivr CDN](https://www.jsdelivr.com/)
- [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Creating Bookmarklets](https://en.wikipedia.org/wiki/Bookmarklet)
