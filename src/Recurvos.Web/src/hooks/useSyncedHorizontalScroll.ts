import { useEffect, useRef } from "react";

export function useSyncedHorizontalScroll(dependencies: readonly unknown[]) {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const topInnerRef = useRef<HTMLDivElement | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomInnerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const top = topScrollRef.current;
    const topInner = topInnerRef.current;
    const content = contentScrollRef.current;
    const bottom = bottomScrollRef.current;
    const bottomInner = bottomInnerRef.current;

    if (!top || !topInner || !content || !bottom || !bottomInner) {
      return;
    }

    const updateWidth = () => {
      const width = `${content.scrollWidth}px`;
      topInner.style.width = width;
      bottomInner.style.width = width;
      if (top.scrollLeft !== content.scrollLeft) {
        top.scrollLeft = content.scrollLeft;
      }
      if (bottom.scrollLeft !== content.scrollLeft) {
        bottom.scrollLeft = content.scrollLeft;
      }
    };

    const syncFromTop = () => {
      if (content.scrollLeft !== top.scrollLeft) {
        content.scrollLeft = top.scrollLeft;
      }
      if (bottom.scrollLeft !== top.scrollLeft) {
        bottom.scrollLeft = top.scrollLeft;
      }
    };

    const syncFromContent = () => {
      if (top.scrollLeft !== content.scrollLeft) {
        top.scrollLeft = content.scrollLeft;
      }
      if (bottom.scrollLeft !== content.scrollLeft) {
        bottom.scrollLeft = content.scrollLeft;
      }
    };

    const syncFromBottomBar = () => {
      if (content.scrollLeft !== bottom.scrollLeft) {
        content.scrollLeft = bottom.scrollLeft;
      }
      if (top.scrollLeft !== bottom.scrollLeft) {
        top.scrollLeft = bottom.scrollLeft;
      }
    };

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(content);

    top.addEventListener("scroll", syncFromTop);
    content.addEventListener("scroll", syncFromContent);
    bottom.addEventListener("scroll", syncFromBottomBar);
    window.addEventListener("resize", updateWidth);

    updateWidth();

    return () => {
      resizeObserver.disconnect();
      top.removeEventListener("scroll", syncFromTop);
      content.removeEventListener("scroll", syncFromContent);
      bottom.removeEventListener("scroll", syncFromBottomBar);
      window.removeEventListener("resize", updateWidth);
    };
  }, [...dependencies]);

  return {
    topScrollRef,
    topInnerRef,
    contentScrollRef,
    bottomScrollRef,
    bottomInnerRef,
  };
}
