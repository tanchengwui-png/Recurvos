import { useEffect, useRef } from "react";

const interactiveSelector = "button, a, input, select, textarea, label";

export function useDragToScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest(interactiveSelector)) {
        return;
      }

      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = element.scrollLeft;
      startTop = element.scrollTop;
      element.classList.add("is-dragging");
      element.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDragging) {
        return;
      }

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      element.scrollLeft = startLeft - deltaX;
      element.scrollTop = startTop - deltaY;
    };

    const stopDragging = (event?: PointerEvent) => {
      if (!isDragging) {
        return;
      }

      isDragging = false;
      element.classList.remove("is-dragging");

      if (event && element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", stopDragging);
    element.addEventListener("pointercancel", stopDragging);
    element.addEventListener("pointerleave", stopDragging);

    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", stopDragging);
      element.removeEventListener("pointercancel", stopDragging);
      element.removeEventListener("pointerleave", stopDragging);
    };
  }, []);

  return ref;
}
