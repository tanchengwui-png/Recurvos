import { useEffect, useState } from "react";
import { msicOfficialEntries, type MsicEntry } from "../lib/msicOfficial";

type MsicCodeModalProps = {
  initialCode: string;
  onClose: () => void;
  onSelect: (entry: MsicEntry) => void;
};

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

export function MsicCodeModal({ initialCode, onClose, onSelect }: MsicCodeModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedClassName, setSelectedClassName] = useState("");
  const [selectedCode, setSelectedCode] = useState(initialCode);

  useEffect(() => {
    const initialEntry = msicOfficialEntries.find((entry) => entry.code === initialCode) ?? null;
    setSearchTerm("");
    setSelectedSection(initialEntry?.section ?? "");
    setSelectedDivision(initialEntry?.division ?? "");
    setSelectedGroup(initialEntry?.group ?? "");
    setSelectedClassName(initialEntry?.className ?? "");
    setSelectedCode(initialEntry?.code ?? "");
  }, [initialCode]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const searchFilteredEntries = normalizedSearchTerm
    ? msicOfficialEntries.filter((entry) =>
      [
        entry.code,
        entry.item,
        entry.section,
        entry.division,
        entry.group,
        entry.className,
      ].some((value) => value.toLowerCase().includes(normalizedSearchTerm)))
    : msicOfficialEntries;

  const sectionFilteredEntries = selectedSection
    ? searchFilteredEntries.filter((entry) => entry.section === selectedSection)
    : searchFilteredEntries;

  const divisionFilteredEntries = selectedDivision
    ? sectionFilteredEntries.filter((entry) => entry.division === selectedDivision)
    : sectionFilteredEntries;

  const groupFilteredEntries = selectedGroup
    ? divisionFilteredEntries.filter((entry) => entry.group === selectedGroup)
    : divisionFilteredEntries;

  const classFilteredEntries = selectedClassName
    ? groupFilteredEntries.filter((entry) => entry.className === selectedClassName)
    : groupFilteredEntries;

  const selectedEntry = msicOfficialEntries.find((entry) => entry.code === selectedCode) ?? null;
  const sectionOptions = uniqueValues(searchFilteredEntries.map((entry) => entry.section));
  const divisionOptions = uniqueValues(sectionFilteredEntries.map((entry) => entry.division));
  const groupOptions = uniqueValues(divisionFilteredEntries.map((entry) => entry.group));
  const classOptions = uniqueValues(groupFilteredEntries.map((entry) => entry.className));

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="card modal-card msic-modal" role="dialog" aria-modal="true" aria-labelledby="msic-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="msic-modal-header">
          <h3 id="msic-modal-title">Select MSIC Code</h3>
          <button type="button" className="msic-modal-close" aria-label="Close MSIC picker" onClick={onClose}>×</button>
        </div>

        <div className="msic-modal-search">
          <input
            className="text-input"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Type in 5-digit MSIC code or describe your business activity here"
          />
        </div>

        <div className="msic-modal-divider" />

        <div className="form-stack msic-modal-body">
          <p className="msic-modal-section-title"><span aria-hidden="true">*</span> Selected MSIC Code</p>

          <select
            value={selectedSection}
            onChange={(event) => {
              setSelectedSection(event.target.value);
              setSelectedDivision("");
              setSelectedGroup("");
              setSelectedClassName("");
              setSelectedCode("");
            }}
          >
            <option value="">Select sector</option>
            {sectionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={selectedDivision}
            onChange={(event) => {
              setSelectedDivision(event.target.value);
              setSelectedGroup("");
              setSelectedClassName("");
              setSelectedCode("");
            }}
          >
            <option value="">Select category</option>
            {divisionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={selectedGroup}
            onChange={(event) => {
              setSelectedGroup(event.target.value);
              setSelectedClassName("");
              setSelectedCode("");
            }}
          >
            <option value="">Select group</option>
            {groupOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select
            value={selectedClassName}
            onChange={(event) => {
              setSelectedClassName(event.target.value);
              setSelectedCode("");
            }}
          >
            <option value="">Select class</option>
            {classOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select value={selectedCode} onChange={(event) => setSelectedCode(event.target.value)}>
            <option value="">Select item</option>
            {classFilteredEntries.map((entry) => (
              <option key={entry.code} value={entry.code}>{`${entry.code} - ${entry.item}`}</option>
            ))}
          </select>

          {selectedEntry ? (
            <div className="msic-modal-preview">
              <strong>{`${selectedEntry.code} - ${selectedEntry.item}`}</strong>
              <span>{selectedEntry.section}</span>
              <span>{selectedEntry.division}</span>
              <span>{selectedEntry.group}</span>
              <span>{selectedEntry.className}</span>
            </div>
          ) : null}
        </div>

        <div className="modal-actions msic-modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="button button-primary" disabled={!selectedEntry} onClick={() => selectedEntry ? onSelect(selectedEntry) : undefined}>OK</button>
        </div>
      </div>
    </div>
  );
}
