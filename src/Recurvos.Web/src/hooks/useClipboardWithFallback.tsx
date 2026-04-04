import { useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "../lib/clipboard";

type ClipboardFallbackRequest = {
  title: string;
  text: string;
  description?: string;
  onCopied?: () => void;
  onCopyFailed?: (error: Error) => void;
};

type ClipboardFallbackState = ClipboardFallbackRequest & {
  successMessage?: string;
};

const DEFAULT_FALLBACK_DESCRIPTION = "Clipboard access is blocked after the mobile app/browser finishes loading the data. Tap Copy now below, or long-press the text field and copy it manually.";

export function useClipboardWithFallback() {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fallbackState, setFallbackState] = useState<ClipboardFallbackState | null>(null);

  useEffect(() => {
    if (!fallbackState) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const textArea = textAreaRef.current;
      if (!textArea) {
        return;
      }

      textArea.focus({ preventScroll: true });
      textArea.select();
      textArea.setSelectionRange(0, textArea.value.length);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [fallbackState]);

  async function copyTextWithFallback(request: ClipboardFallbackRequest) {
    try {
      await copyTextToClipboard(request.text);
      setFallbackState(null);
      request.onCopied?.();
      return true;
    } catch {
      setFallbackState({
        ...request,
        description: request.description ?? DEFAULT_FALLBACK_DESCRIPTION,
      });
      return false;
    }
  }

  const clipboardFallbackModal = fallbackState ? (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="clipboard-fallback-title">
        <h3 id="clipboard-fallback-title">{fallbackState.title}</h3>
        <p className="muted">{fallbackState.description}</p>
        <textarea
          ref={textAreaRef}
          className="text-input settings-message-template"
          rows={8}
          readOnly
          value={fallbackState.text}
          aria-label={`${fallbackState.title} text`}
        />
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={() => setFallbackState(null)}>Close</button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              const textArea = textAreaRef.current;
              if (!textArea) {
                return;
              }

              textArea.focus({ preventScroll: true });
              textArea.select();
              textArea.setSelectionRange(0, textArea.value.length);
            }}
          >
            Select text
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={async () => {
              if (!fallbackState) {
                return;
              }

              try {
                await copyTextToClipboard(fallbackState.text);
                fallbackState.onCopied?.();
                setFallbackState(null);
              } catch (error) {
                const clipboardError = error instanceof Error ? error : new Error("Unable to copy on this device.");
                fallbackState.onCopyFailed?.(clipboardError);
              }
            }}
          >
            Copy now
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return {
    copyTextWithFallback,
    clipboardFallbackModal,
  };
}
