import {
  $,
  state
} from "./state.js";

const MAX_TERMINAL_CHARS = 60000;

let initialized = false;
let open = false;
let running = false;
let outputText = "";

function setCwdLabel(cwd) {
  const el = $("terminalCwd");
  if (!el) return;
  el.textContent = cwd || state.root || "Not started";
}

function trimOutput() {
  if (outputText.length <= MAX_TERMINAL_CHARS) return;
  outputText = outputText.slice(outputText.length - MAX_TERMINAL_CHARS);
}

function renderOutput() {
  const output = $("terminalOutput");
  if (!output) return;

  output.textContent = outputText;
  output.scrollTop = output.scrollHeight;
}

function appendOutput(data) {
  outputText += data;
  trimOutput();
  renderOutput();
}

function appendSystemLine(text) {
  appendOutput(`\n[Helio] ${text}\n`);
}

async function startTerminal(options = {}) {
  if (!window.api?.terminal?.start) {
    appendSystemLine("Terminal API is unavailable.");
    return;
  }

  try {
    const res = await window.api.terminal.start(options);
    running = !!res?.running;
    setCwdLabel(res?.cwd);
  } catch (error) {
    appendSystemLine(error?.message || "Terminal failed to start.");
  }
}

function focusTerminalInput() {
  $("terminalInput")?.focus();
}

export async function showTerminal() {
  const panel = $("terminalPanel");
  if (!panel) return;

  open = true;
  panel.style.display = "flex";

  if (!running) {
    await startTerminal();
  }

  requestAnimationFrame(focusTerminalInput);
}

export function hideTerminal() {
  const panel = $("terminalPanel");
  if (!panel) return;

  open = false;
  panel.style.display = "none";
}

export function toggleTerminal() {
  if (open) {
    hideTerminal();
    return;
  }

  showTerminal();
}

function handleTerminalEvent(payload) {
  if (!payload || typeof payload !== "object") return;

  if (payload.type === "ready") {
    running = true;
    setCwdLabel(payload.cwd);
    appendSystemLine(`Terminal started in ${payload.cwd || "current directory"}.`);
    return;
  }

  if (payload.type === "stdout" || payload.type === "stderr") {
    appendOutput(String(payload.data || ""));
    return;
  }

  if (payload.type === "error") {
    appendSystemLine(String(payload.data || "Terminal error."));
    return;
  }

  if (payload.type === "exit") {
    running = false;
    appendSystemLine(`Terminal exited${payload.code === null ? "" : ` with code ${payload.code}`}.`);
  }
}

async function submitCommand() {
  const input = $("terminalInput");
  if (!input) return;

  const command = input.value;
  if (!command.trim()) return;

  input.value = "";
  appendOutput(`> ${command}\n`);

  try {
    await window.api.terminal.write(`${command}\n`);
  } catch (error) {
    appendSystemLine(error?.message || "Failed to write to terminal.");
  }
}

export function initTerminal() {
  if (initialized) return;
  initialized = true;

  window.api?.terminal?.onEvent?.(handleTerminalEvent);

  $("btnTerminal")?.addEventListener("click", () => toggleTerminal());
  $("terminalCloseBtn")?.addEventListener("click", () => hideTerminal());
  $("terminalClearBtn")?.addEventListener("click", () => {
    outputText = "";
    renderOutput();
  });
  $("terminalRestartBtn")?.addEventListener("click", async () => {
    appendSystemLine("Restarting terminal...");
    await startTerminal({ restart: true });
    focusTerminalInput();
  });

  $("terminalInput")?.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await submitCommand();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      outputText = "";
      renderOutput();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      try {
        await window.api.terminal.write("\x03");
      } catch {}
    }
  });
}
