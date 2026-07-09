import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setHighlightedIndex(0);
    searchInputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function open() {
    if (!disabled) {
      setIsOpen(true);
    }
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
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
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
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setQuery("");
    }
  }

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
        onClick={() => setIsOpen((current) => !current)}
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
      {isOpen ? (
        <div className="searchable-select-popover">
          <input
            ref={searchInputRef}
            className="text-input searchable-select-search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <ul id={listboxId} className="searchable-select-list" role="listbox" aria-label={ariaLabel}>
            {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
              <li key={`${option.value}-${option.label}`} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  className={`searchable-select-option ${index === highlightedIndex ? "searchable-select-option-active" : ""}`.trim()}
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
        </div>
      ) : null}
    </div>
  );
}
