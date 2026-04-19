export function getCommands(actions) {
  return [
    { id: "save", title: "Save File", shortcut: "Ctrl+S", action: actions.saveCurrentFile },
    { id: "open-file", title: "Open File...", shortcut: "Ctrl+O", action: actions.openFileFlow },
    { id: "open-folder", title: "Open Folder...", shortcut: "Ctrl+Shift+O", action: actions.openFolderFlow },
    { id: "find-in-file", title: "Find in File", shortcut: "Ctrl+F", action: actions.openFindPanel },
    { id: "close-tab", title: "Close Current Tab", shortcut: "Ctrl+W", action: actions.requestCloseCurrentTab },
    { id: "close-all-tabs", title: "Close All Tabs", action: actions.closeAllTabs },
    { id: "next-tab", title: "Next Tab", shortcut: "Ctrl+Tab", action: actions.nextTab },
    { id: "prev-tab", title: "Previous Tab", shortcut: "Ctrl+Shift+Tab", action: actions.prevTab },
    { id: "settings", title: "Open Settings", action: actions.openSettings },
    { id: "toggle-terminal", title: "Toggle Terminal", shortcut: "Ctrl+`", action: actions.toggleTerminal },
    { id: "toggle-theme", title: "Toggle Theme", action: actions.toggleTheme },
    { id: "font-increase", title: "Increase Font Size", shortcut: "Ctrl++", action: actions.increaseFontSize },
    { id: "font-decrease", title: "Decrease Font Size", shortcut: "Ctrl+-", action: actions.decreaseFontSize },
    { id: "font-reset", title: "Reset Font Size", action: actions.resetFontSize },
    { id: "goto-line", title: "Go to Line...", shortcut: "Ctrl+G", action: actions.gotoLine }
  ];
}
