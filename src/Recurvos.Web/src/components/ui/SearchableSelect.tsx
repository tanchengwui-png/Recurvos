import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { SearchableSelectOption } from "../../lib/localeOptions";

type SearchableSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearable?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  loading?: boolean;
  error?: string;
  portalPopover?: boolean;
  portalPopoverZIndex?: CSSProperties["zIndex"];
  onCreate?: (name: string) => void;
  createLabel?: string;
  /** Keeps the create action available below the scrollable results. */
  persistentCreateAction?: boolean;
};

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No matches found.",
  clearable = false,
  ariaLabel,
  disabled = false,
  className = "",
  loading = false,
  error = "",
  portalPopover = false,
  portalPopoverZIndex = "var(--z-popover)",
  onCreate,
  createLabel = "Add",
  persistentCreateAction = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const [portalPopoverStyle, setPortalPopoverStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const searchSpace = [
        option.label,
        option.value,
        ...(option.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return searchSpace.includes(normalizedQuery);
    });
  }, [options, query]);
  const creatableName = query.trim();
  const canCreate = Boolean(onCreate && creatableName && !options.some((option) => option.label.trim().toLowerCase() === creatableName.toLowerCase()));
  const showCreateAction = Boolean(onCreate && (persistentCreateAction || canCreate));
  const selectableItemCount = filteredOptions.length + (showCreateAction ? 1 : 0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node) && !popoverRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !portalPopover || !containerRef.current) {
      return;
    }

    function updatePosition() {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const viewportPadding = 8;
      const popoverGap = 6;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 0;
      const spaceBelow = Math.max(0, viewportHeight - bounds.bottom - popoverGap - viewportPadding);
      const spaceAbove = Math.max(0, bounds.top - popoverGap - viewportPadding);
      const opensAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow;
      const availableHeight = opensAbove ? spaceAbove : spaceBelow;
      const renderedHeight = Math.min(popoverHeight || availableHeight, availableHeight);

      setPortalPopoverStyle({
        top: opensAbove ? Math.max(viewportPadding, bounds.top - popoverGap - renderedHeight) : bounds.bottom + popoverGap,
        left: Math.max(viewportPadding, Math.min(bounds.left, window.innerWidth - bounds.width - viewportPadding)),
        width: Math.min(bounds.width, window.innerWidth - viewportPadding * 2),
        maxHeight: availableHeight,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, portalPopover]);

  function open() {
    if (!disabled) {
      setHighlightedIndex(0);
      setIsOpen(true);
    }
  }

  function toggle() {
    if (isOpen) {
      setIsOpen(false);
      setQuery("");
      return;
    }
    open();
  }

  function selectOption(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    setQuery("");
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(selectableItemCount - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredOptions[highlightedIndex];
      if (selected) {
        selectOption(selected.value);
      } else if (showCreateAction) {
        onCreate?.(creatableName);
        setIsOpen(false);
        setQuery("");
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery("");
    }
  }

  const popover = isOpen ? (
    <div
      ref={popoverRef}
      className="searchable-select-popover"
      style={portalPopover && portalPopoverStyle ? { position: "fixed", top: portalPopoverStyle.top, left: portalPopoverStyle.left, right: "auto", width: portalPopoverStyle.width, maxHeight: portalPopoverStyle.maxHeight, zIndex: portalPopoverZIndex } : undefined}
    >
      <input
        ref={searchInputRef}
        className="text-input searchable-select-search"
        value={query}
        placeholder={searchPlaceholder}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleSearchKeyDown}
      />
      <ul id={listboxId} className="searchable-select-list" role="listbox" aria-label={ariaLabel}>
        {error ? (
          <li className="searchable-select-empty" role="alert">{error}</li>
        ) : loading ? (
          <li className="searchable-select-empty">Loading accounts...</li>
        ) : filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
          <li key={`${option.value}-${option.label}`} role="option" aria-selected={option.value === value}>
            <button
              type="button"
              className={`searchable-select-option ${index === highlightedIndex ? "searchable-select-option-active" : ""} ${option.value === value ? "searchable-select-option-selected" : ""}`.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option.value)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {option.label}
            </button>
          </li>
        )) : (
          <li className="searchable-select-empty">{emptyText}</li>
        )}
      </ul>
      {showCreateAction ? (
        <div className="searchable-select-create-action">
          <button type="button" className={`lookup-add-option ${highlightedIndex === filteredOptions.length ? "lookup-add-option-active" : ""}`.trim()} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setHighlightedIndex(filteredOptions.length)} onClick={() => {
          onCreate?.(creatableName);
          setIsOpen(false);
          setQuery("");
        }}>
          {persistentCreateAction ? `+ ${createLabel}` : `+ ${createLabel} "${creatableName}"`}
          </button>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`searchable-select ${className}`.trim()}>
      <button
        id={id}
        type="button"
        className={`text-input searchable-select-trigger ${isOpen ? "searchable-select-trigger-open" : ""}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={selectedOption ? "searchable-select-value" : "searchable-select-placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="searchable-select-trigger-actions">
          {clearable && value ? (
            <span
              role="button"
              tabIndex={0}
              className="searchable-select-clear"
              aria-label="Clear selection"
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange("");
                }
              }}
            >
              x
            </span>
          ) : null}
          <span className="searchable-select-chevron" aria-hidden="true">v</span>
        </span>
      </button>
      {portalPopover && popover ? createPortal(popover, document.body) : popover}
    </div>
  );
}
