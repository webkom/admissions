import { useCallback, useEffect, useRef } from "react";

interface DetailsMenuOptions {
  focusFirstItemOnOpen?: boolean;
}

export const useDetailsMenu = ({
  focusFirstItemOnOpen = true,
}: DetailsMenuOptions = {}) => {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const menuItems = useCallback(
    () =>
      Array.from(
        detailsRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([disabled])',
        ) ?? [],
      ).filter((item) => item.getAttribute("aria-disabled") !== "true"),
    [],
  );

  const closeDetails = useCallback((restoreFocus = false) => {
    const details = detailsRef.current;
    if (!details?.open) return;
    details.open = false;
    if (restoreFocus) {
      details.querySelector<HTMLElement>("summary")?.focus();
    }
  }, []);

  const handleDetailsToggle = useCallback(() => {
    if (!focusFirstItemOnOpen || !detailsRef.current?.open) return;
    window.requestAnimationFrame(() => {
      if (detailsRef.current?.open) menuItems()[0]?.focus();
    });
  }, [focusFirstItemOnOpen, menuItems]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!detailsRef.current?.contains(event.target as Node)) {
        closeDetails(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (
        detailsRef.current?.open &&
        !detailsRef.current.contains(event.target as Node)
      ) {
        closeDetails(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (!details?.open) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeDetails(true);
        return;
      }

      if (!details.contains(document.activeElement)) return;
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }

      const items = menuItems();
      if (items.length === 0) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowUp"
              ? currentIndex <= 0
                ? items.length - 1
                : currentIndex - 1
              : currentIndex < 0 || currentIndex === items.length - 1
                ? 0
                : currentIndex + 1;
      items[nextIndex]?.focus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDetails, menuItems]);

  return {
    detailsRef,
    closeDetails,
    handleDetailsToggle,
  };
};
