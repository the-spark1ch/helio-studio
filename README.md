# Helio Studio

Helio Studio is a lightweight desktop IDE built with **Electron** and **Monaco Editor**. It focuses on a calm, keyboard-friendly editing experience with just enough IDE features to stay productive without turning the interface into a wall of panels.

**Current version:** 1.4.0

---

## Overview

Helio Studio provides a familiar code editing workflow with tabs, a project explorer, recent items, session restore, command palette, built-in terminal, and a polished custom UI around Monaco.

The project is intentionally simple: there is no frontend build step, and the renderer is written with modular vanilla JavaScript, HTML, and CSS.

---

## Features

- Monaco-based code editor with syntax highlighting.
- Project explorer for opened folders.
- Multi-tab editing with dirty-state protection.
- Save button, `Ctrl+S`, and command palette save action.
- Status bar with file state, language, cursor position, autosave state, and tab count.
- Session restore for the last opened project, open tabs, and active tab.
- Recent files and folders on the welcome screen.
- Command Palette with quick access to common actions.
- Custom find-in-file panel on `Ctrl+F`.
- Custom context menu instead of the native Electron/Monaco menu.
- Built-in terminal panel with clear, restart, and hide controls.
- Light and dark themes.
- Adjustable editor font size.
- Adjustable tab width.
- Optional autosave with configurable delay.
- Local settings persistence.

---

## Screenshot

![Helio Studio Screenshot](./assets/screenshot.png)

---

## Keyboard Shortcuts

- `Ctrl+P` - Open Command Palette
- `Ctrl+S` - Save current file
- `Ctrl+O` - Open file
- `Ctrl+Shift+O` - Open folder
- `Ctrl+F` - Find in current file
- `Ctrl+W` - Close current tab
- `Ctrl+Tab` - Next tab
- `Ctrl+Shift+Tab` - Previous tab
- <kbd>Ctrl</kbd> + <kbd>`</kbd> - Toggle terminal
- `Ctrl+Space` - Trigger custom suggestions
- `Ctrl++` / `Ctrl+-` - Increase or decrease editor font size
- `Ctrl+0` - Reset editor font size

---

## Settings

Settings are available from the top bar.

Available options:

- Theme: dark or light
- Tab width
- Editor font size
- Autosave delay

Settings are stored locally and restored automatically on the next launch.

---

## Built-In Terminal

Helio Studio includes a simple integrated terminal panel. It starts in the opened workspace when possible and can be toggled from the top bar, the command palette, or with <kbd>Ctrl</kbd> + <kbd>`</kbd>.

The terminal is implemented without `node-pty`, so regular shell commands work well, while full-screen interactive TUI applications may be limited.

---

## Development

Install dependencies:

```powershell
npm install
```

Run the app in development:

```powershell
npm start
```

Build for Windows:

```powershell
npm run dist:win
```

Build a portable Windows version:

```powershell
npm run dist:win-portable
```

Build a Windows installer:

```powershell
npm run dist:win-setup
```

Build artifacts are written to `dist`.

---

## Installation

Download the latest Windows release from GitHub Releases.

Recommended files for version 1.4.0:

- `Helio Studio Setup 1.4.0.exe` - installer
- `Helio Studio 1.4.0.exe` - portable version

---

## Security Model

The renderer runs with `contextIsolation`, `sandbox`, disabled Node integration, and a preload bridge. File access goes through IPC handlers in the main process and is limited to user-approved files and folders.

---

## Philosophy

Helio Studio is intentionally minimal.

The goal is to provide a predictable development environment that supports focus: fast startup, direct actions, clear state, and a small set of features that work together without unnecessary visual noise.

---

## License

GPL-3.0

---

## Links

Source code:  
https://github.com/the-spark1ch/helio-studio
