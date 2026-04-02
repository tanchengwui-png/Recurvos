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
        <p className="eyebrow">Home screen</p>
        <h3>Add Recurvos to your home screen</h3>
        <p>Optional. Open Recurvos faster and use it like an app from your phone or desktop.</p>
        {isManualInstallOnly ? (
          <p className="install-prompt-hint">On iPhone Safari, tap Share, then choose Add to Home Screen.</p>
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
