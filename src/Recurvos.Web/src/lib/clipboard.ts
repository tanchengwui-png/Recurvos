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

  const textArea = document.createElement("textarea");
  textArea.value = normalized;
  textArea.setAttribute("readonly", "true");
  textArea.setAttribute("aria-hidden", "true");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.width = "1px";
  textArea.style.height = "1px";
  textArea.style.padding = "0";
  textArea.style.border = "0";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";

  document.body.appendChild(textArea);
  textArea.focus({ preventScroll: true });
  textArea.select();
  textArea.setSelectionRange(0, normalized.length);

  const copied = document.execCommand("copy");
  textArea.remove();

  if (!copied) {
    throw new Error("Unable to copy to clipboard on this device.");
  }
}
