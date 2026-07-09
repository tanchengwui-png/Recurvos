type InstallPromptCardProps = {
  canTriggerInstall: boolean;
  isManualInstallOnly: boolean;
  onDismiss: () => void;
  onPrimaryAction: () => void;
};

export function InstallPromptCard({
  canTriggerInstall,
  isManualInstallOnly,
  onDismiss,
  onPrimaryAction,
}: InstallPromptCardProps) {
  const primaryLabel = canTriggerInstall ? "Add now" : "Show me how";

  return (
    <section className="install-prompt-card" aria-label="Install Recurvos">
      <div className="install-prompt-copy">
        <h3>Add to home screen</h3>
        {isManualInstallOnly ? (
          <p className="install-prompt-hint">On iPhone Safari, tap Share and choose Add to Home Screen.</p>
        ) : null}
      </div>
      <div className="install-prompt-actions">
        <button type="button" className="button" onClick={onPrimaryAction}>
          {primaryLabel}
        </button>
        <button type="button" className="button button-secondary" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </section>
  );
}
