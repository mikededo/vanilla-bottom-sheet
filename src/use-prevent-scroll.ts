// This is a modified version of usePreventScroll from react-spectrum
// https://github.com/adobe/react-spectrum/blob/main/packages/@react-aria/overlays/src/usePreventScroll.ts
//
// It includes:
// - Better typings
// - Required only event listeners for the ios scroll blocking

import { useEffect, useLayoutEffect } from "react";

export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const chain =
  (...callbacks: unknown[]): ((...args: unknown[]) => void) =>
  (...args: unknown[]) => {
    for (const callback of callbacks) {
      if (typeof callback === "function") {
        callback(...args);
      }
    }
  };

const testPlatform = (exp: RegExp): boolean | undefined =>
  typeof window !== "undefined" && window.navigator != null
    ? exp.test(
        // @ts-expect-error userAgentData is experimental and not yet supported in Safari iOs nor Firefox Mobile
        // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userAgentData
        window.navigator["userAgentData"]?.platform ||
          window.navigator.platform,
      )
    : false;

const isMac = (): boolean | undefined => testPlatform(/^Mac/);
const isIPhone = (): boolean | undefined => testPlatform(/^iPhone/);
const isIPad = (): boolean | undefined =>
  testPlatform(/^iPad/) ||
  // iPadOS 13 lies and says it's a Mac, but we can distinguish by detecting touch support.
  (isMac() && navigator.maxTouchPoints > 1);

const isIOS = (): boolean | undefined => isIPhone() || isIPad();

const isScrollable = (node: Element): boolean => {
  if (!window) {
    return false;
  }

  const style = window.getComputedStyle(node);
  return /(auto|scroll)/.test(
    style.overflow + style.overflowX + style.overflowY,
  );
};

const getScrollParent = (node: Element): Element => {
  if (isScrollable(node)) {
    node = node.parentElement as HTMLElement;
  }

  while (node && !isScrollable(node)) {
    node = node.parentElement as HTMLElement;
  }

  return node || document.scrollingElement || document.documentElement;
};

// HTML input types that do not cause the software keyboard to appear.
const NON_TEXT_INPUT_TYPES = new Set([
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "image",
  "button",
  "submit",
  "reset",
]);

type ExtractStringProperties<T> = {
  [K in keyof T]: T[K] extends string ? T[K] : never;
};
type Styles = ElementCSSInlineStyle["style"];
type StyleProperty = ExtractStringProperties<keyof Styles>;

const setStyle = <S extends StyleProperty>(
  element: HTMLElement,
  style: S,
  value: Styles[S],
) => {
  const cur = element.style[style];
  element.style[style] = value;

  return () => {
    element.style[style] = cur;
  };
};

// Adds an event listener to an element, and returns a function to remove it.
const addEvent = <
  K extends keyof GlobalEventHandlersEventMap,
  T extends EventTarget,
>(
  target: T,
  event: K,
  handler: (this: T, ev: GlobalEventHandlersEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) => {
  target.addEventListener(event, handler as EventListener, options);

  return () => {
    target.removeEventListener(event, handler as EventListener, options);
  };
};

const isInput = (target: Element) =>
  (target instanceof HTMLInputElement &&
    !NON_TEXT_INPUT_TYPES.has(target.type)) ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

// The number of active usePreventScroll calls. Used to determine whether to revert back to
// the original page style/scroll position
let preventScrollCount = 0;
let restore: () => void;

// For most browsers, all we need to do is set `overflow: hidden` on the root element, and
// add some padding to prevent the page from shifting when the scrollbar is hidden.
const standardPreventScroll = () =>
  chain(
    setStyle(
      document.documentElement,
      "paddingRight",
      `${window.innerWidth - document.documentElement.clientWidth}px`,
    ),
  );

// While the original hook tackles many cases, we only need to handle the touch
// related ones:
//
// 1. Prevent default on `touchmove` events that are not in a scrollable element. This prevents touch scrolling
//    on the window.
// 2. Prevent default on `touchmove` events inside a scrollable element when the scroll position is at the
//    top or bottom. This avoids the whole page scrolling instead, but does prevent overscrolling.
// 3. Prevent default on `touchend` events on input elements and handle focusing the element ourselves.
const safariMobilePreventScroll = () => {
  let scrollable: Element;
  let lastY = 0;

  const onTouchStart = (e: TouchEvent) => {
    // Store the nearest scrollable parent element from the element that the user touched.
    scrollable = getScrollParent(e.target as Element);
    if (
      scrollable === document.documentElement &&
      scrollable === document.body
    ) {
      return;
    }

    lastY = e.changedTouches[0].pageY;
  };

  const onTouchMove = (e: TouchEvent) => {
    // Prevent scrolling the window.
    if (
      !scrollable ||
      scrollable === document.documentElement ||
      scrollable === document.body
    ) {
      e.preventDefault();
      return;
    }

    // Prevent scrolling up when at the top and scrolling down when at the bottom
    // of a nested scrollable area, otherwise mobile Safari will start scrolling
    // the window instead. Unfortunately, this disables bounce scrolling when at
    // the top but it's the best we can do.
    const y = e.changedTouches[0].pageY;
    const scrollTop = scrollable.scrollTop;
    const bottom = scrollable.scrollHeight - scrollable.clientHeight;

    if (bottom === 0) {
      return;
    }

    if ((scrollTop <= 0 && y > lastY) || (scrollTop >= bottom && y < lastY)) {
      e.preventDefault();
    }

    lastY = y;
  };

  const onTouchEnd = (e: TouchEvent) => {
    const target = e.target as HTMLElement;

    // Apply this change if we're not already focused on the target element
    if (isInput(target) && target !== document.activeElement) {
      e.preventDefault();

      // Apply a transform to trick Safari into thinking the input is at the top of the page
      // so it doesn't try to scroll it into view. When tapping on an input, this needs to
      // be done before the "focus" event, so we have to focus the element ourselves.
      target.style.transform = "translateY(-2000px)";
      target.focus();
      requestAnimationFrame(() => {
        target.style.transform = "";
      });
    }
  };

  // Record the original scroll position so we can restore it.
  // Then apply a negative margin to the body to offset it by the scroll position. This will
  // enable us to scroll the window to the top, which is required for the rest of this to work.
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const restoreStyles = chain(
    setStyle(
      document.documentElement,
      "paddingRight",
      `${window.innerWidth - document.documentElement.clientWidth}px`,
    ),
  );

  // Scroll to the top. The negative margin on the body will make this appear the same.
  window.scrollTo(0, 0);

  const removeEvents = chain(
    addEvent(document, "touchstart", onTouchStart, {
      passive: false,
      capture: true,
    }),
    addEvent(document, "touchmove", onTouchMove, {
      passive: false,
      capture: true,
    }),
    addEvent(document, "touchend", onTouchEnd, {
      passive: false,
      capture: true,
    }),
  );

  return () => {
    // Restore styles and scroll the page back to where it was.
    restoreStyles();
    removeEvents();
    window.scrollTo(scrollX, scrollY);
  };
};

type PreventScrollOptions = {
  /** Whether the scroll lock is disabled. */
  isDisabled?: boolean;
};

/**
 * Prevents scrolling on the document body on mount, and
 * restores it on unmount. Also ensures that content does not
 * shift due to the scrollbars disappearing.
 */
export const usePreventScroll = (options: PreventScrollOptions = {}) => {
  const { isDisabled } = options;

  useIsomorphicLayoutEffect(() => {
    if (isDisabled) {
      return;
    }

    preventScrollCount++;
    if (preventScrollCount === 1) {
      if (isIOS()) {
        restore = safariMobilePreventScroll();
      } else {
        restore = standardPreventScroll();
      }
    }

    return () => {
      preventScrollCount--;
      if (preventScrollCount === 0) {
        restore();
      }
    };
  }, [isDisabled]);
};
