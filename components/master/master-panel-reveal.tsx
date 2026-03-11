"use client";

import {
  useEffect,
  useReducer,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils/cn";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PANEL_TRANSITION_MS = 320;
const PANEL_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

type RevealState = {
  rendered: boolean;
  visible: boolean;
};

type RevealAction =
  | {
      type: "sync";
      open: boolean;
      prefersReduced: boolean;
    }
  | {
      type: "activate";
    }
  | {
      type: "hide";
    };

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function createInitialRevealState({
  open,
}: {
  open: boolean;
}): RevealState {
  return {
    rendered: open,
    visible: open,
  };
}

function revealReducer(state: RevealState, action: RevealAction): RevealState {
  if (action.type === "sync") {
    if (action.prefersReduced) {
      if (state.rendered === action.open && state.visible === action.open) {
        return state;
      }

      return {
        rendered: action.open,
        visible: action.open,
      };
    }

    if (action.open) {
      if (state.rendered && state.visible) {
        return state;
      }

      return {
        rendered: true,
        visible: false,
      };
    }

    if (!state.rendered) {
      return state;
    }

    return {
      rendered: true,
      visible: false,
    };
  }

  if (action.type === "activate") {
    if (!state.rendered || state.visible) {
      return state;
    }

    return {
      rendered: true,
      visible: true,
    };
  }

  if (!state.rendered) {
    return state;
  }

  return {
    rendered: false,
    visible: false,
  };
}

export function MasterPanelReveal({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const initialReducedMotion = prefersReducedMotion();
  const [prefersReduced, setPrefersReduced] = useState(initialReducedMotion);
  const [state, dispatch] = useReducer(revealReducer, { open }, createInitialRevealState);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = () => {
      setPrefersReduced(mediaQuery.matches);
    };

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    dispatch({
      type: "sync",
      open,
      prefersReduced,
    });
  }, [open, prefersReduced]);

  useEffect(() => {
    if (prefersReduced || !state.rendered) {
      return;
    }

    if (open && !state.visible) {
      const frameId = window.requestAnimationFrame(() => {
        dispatch({ type: "activate" });
      });

      return () => window.cancelAnimationFrame(frameId);
    }

    if (!open && !state.visible) {
      const timeoutId = window.setTimeout(() => {
        dispatch({ type: "hide" });
      }, PANEL_TRANSITION_MS);

      return () => window.clearTimeout(timeoutId);
    }
  }, [open, prefersReduced, state.rendered, state.visible]);

  if (!state.rendered) {
    return null;
  }

  const animatedStyle: CSSProperties | undefined = prefersReduced
    ? undefined
    : {
        gridTemplateRows: state.visible ? "1fr" : "0fr",
        opacity: state.visible ? 1 : 0,
        transform: state.visible
          ? "translateY(0) scale(1)"
          : "translateY(-0.75rem) scale(0.985)",
        pointerEvents: state.visible ? "auto" : "none",
        transition: [
          `grid-template-rows ${PANEL_TRANSITION_MS}ms ${PANEL_EASING}`,
          `opacity ${PANEL_TRANSITION_MS}ms ${PANEL_EASING}`,
          `transform ${PANEL_TRANSITION_MS}ms ${PANEL_EASING}`,
        ].join(", "),
      };

  return (
    <div
      className={cn(
        "grid origin-top overflow-hidden motion-reduce:overflow-visible",
      )}
      aria-hidden={!open}
      style={animatedStyle}
    >
      <div className={cn("min-h-0", className)}>{children}</div>
    </div>
  );
}
