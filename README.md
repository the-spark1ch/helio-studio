# Helio Studio

Helio Studio is a minimal, modern IDE focused on clarity, speed, and staying in flow.  
It is built with Electron and Monaco Editor and designed to feel lightweight, calm, and distraction-free.

**Current version:** 1.0.2

---

## Features

- Monaco Editor with syntax highlighting and minimap
- Fixed-width tabs with horizontal scrolling
- Confirmation dialog when closing files with unsaved changes
- Built-in Settings popup (no separate window)
- Light and dark themes
- Adjustable code font size
- Adjustable tab width
- Optional auto save
- Custom autocomplete with keyboard navigation
- Open files and folders with a simple project tree
- Keyboard-first workflow
- Clean welcome screen on startup
- Inter font used consistently across the UI

---

## Settings

Settings are available via the **Settings** button in the top bar.

Available options:
- Theme (Dark / Light)
- Code font size
- Tab width
- Auto save (off or delay-based)

All settings are stored locally and restored on next launch.

---

## Keyboard Shortcuts

| Action | Windows / Linux | macOS |
|------|------------------|-------|
| Open file | Ctrl + O | Cmd + O |
| Open folder | Ctrl + Shift + O | Cmd + Shift + O |
| Save file | Ctrl + S | Cmd + S |
| Close tab | Ctrl + W | Cmd + W |
| Next tab | Ctrl + Tab | Cmd + Tab |
| Previous tab | Ctrl + Shift + Tab | Cmd + Shift + Tab |
| Increase code font size | Ctrl + + | Cmd + + |
| Decrease code font size | Ctrl + - | Cmd + - |
| Reset code font size | Ctrl + 0 | Cmd + 0 |
| Autocomplete (manual) | Ctrl + Space | Cmd + Space |
| Navigate suggestions | Up / Down | Up / Down |
| Accept suggestion | Enter | Enter |
| Close suggestions | Esc | Esc |

---

## Installation (Linux)

### AppImage

1. Download the latest AppImage from **GitHub Releases**
2. Make it executable:

```bash
chmod +x Helio\ Studio-1.0.2.AppImage
```
3. Run it:
```bash
./Helio\ Studio-1.0.2.AppImage
