import type { NavigateFunction } from "react-router-dom";

/** Opens the existing route-backed record details modal over its list after a successful create. */
export function openCreatedRecord(navigate: NavigateFunction, listPath: string, recordPath: string, recordId: string) {
  navigate(`${recordPath}/${recordId}`, {
    replace: true,
    state: {
      backgroundLocation: { pathname: listPath },
      closePath: listPath,
    },
  });
}

/** Uses a list page's existing in-page details modal for document types without detail routes. */
export function openCreatedEmbeddedRecord(navigate: NavigateFunction, listPath: string, recordId: string) {
  navigate(listPath, { replace: true, state: { openRecordId: recordId } });
}
