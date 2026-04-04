export async function copyTextToClipboard(text: string) {
  const normalized = text ?? "";

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(normalized);
      return;
    } catch {
      // Fall back to manual selection for browsers/PWAs that expose the API but reject writes.
    }
  }

  try {
    const copied = copyViaClipboardEvent(normalized);
    if (copied) {
      return;
    }
  } catch {
    // Fall back to manual selection for browsers that reject synthetic clipboard events.
  }

  const copied = copyViaTextAreaSelection(normalized);
  if (!copied) {
    throw new Error("Clipboard access was blocked on this device.");
  }
}

function copyViaClipboardEvent(text: string) {
  const handleCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    event.clipboardData?.setData("text/plain", text);
  };

  document.addEventListener("copy", handleCopy, { capture: true, once: true });

  try {
    return document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", handleCopy, true);
  }
}

function copyViaTextAreaSelection(text: string) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("aria-hidden", "true");
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  textArea.style.left = "-9999px";
  textArea.style.width = "2px";
  textArea.style.height = "2px";
  textArea.style.padding = "0";
  textArea.style.border = "0";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  textArea.style.fontSize = "16px";

  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  document.body.appendChild(textArea);

  try {
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    return document.execCommand("copy");
  } finally {
    textArea.remove();
    if (selection) {
      selection.removeAllRanges();
      if (previousRange) {
        selection.addRange(previousRange);
      }
    }
  }
}
