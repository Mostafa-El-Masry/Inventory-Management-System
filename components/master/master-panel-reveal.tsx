"use client";

import {
  useEffect,
  useReducer,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils/cn";

type RevealPhase = "idle" | "entering" | "exiting";
type RevealState = {
  rendered: boolean;
  phase: RevealPhase;
};
type RevealAction =
  | {
      type: "sync";
      open: boolean;
      prefersReduced: boolean;
    }
  | {
      type: "animation-end";
      open: boolean;
    };

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PANEL_ANIMATION_MS = 1000;

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function createInitialRevealState({
  open,
  prefersReduced,
}: {
  open: boolean;
  prefersReduced: boolean;
}): RevealState {
  return {
    rendered: open,
    phase: open && !prefersReduced ? "entering" : "idle",
  };
}

function revealReducer(state: RevealState, action: RevealAction): RevealState {
  if (action.type === "sync") {
    if (action.prefersReduced) {
      if (state.rendered === action.open && state.phase === "idle") {
        return state;
      }

      return {
        rendered: action.open,
        phase: "idle",
      };
    }

    if (action.open) {
      if (state.rendered && state.phase === "entering") {
        return state;
      }

      return {
        rendered: true,
        phase: "entering",
      };
    }

    if (!state.rendered) {
      if (state.phase === "idle") {
        return state;
      }

      return {
        rendered: false,
        phase: "idle",
      };
    }

    if (state.phase === "exiting") {
      return state;
    }

    return {
      rendered: true,
      phase: "exiting",
    };
  }

  if (state.phase === "entering") {
    return {
      ...state,
      phase: "idle",
    };
  }

  if (state.phase === "exiting" && !action.open) {
    return {
      rendered: false,
      phase: "idle",
    };
  }

  return state;
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
  const reducedMotion = prefersReducedMotion();
  const [state, dispatch] = useReducer(revealReducer, {
    open,
    prefersReduced: reducedMotion,
  }, createInitialRevealState);
  const [prefersReduced, setPrefersReduced] = useState(reducedMotion);

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
    if (prefersReduced || state.phase === "idle") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      dispatch({
        type: "animation-end",
        open,
      });
    }, PANEL_ANIMATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [open, prefersReduced, state.phase]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    dispatch({
      type: "animation-end",
      open,
    });
  }

  if (!state.rendered) {
    return null;
  }

  return (
    <div
      className={cn(
        "origin-top motion-reduce:animate-none",
        state.phase === "entering"
          ? `[animation:ims-master-panel-enter_${PANEL_ANIMATION_MS}ms_cubic-bezier(0.22,1,0.36,1)_both]`
          : "",
        state.phase === "exiting"
          ? `pointer-events-none [animation:ims-master-panel-exit_${PANEL_ANIMATION_MS}ms_cubic-bezier(0.22,1,0.36,1)_both]`
          : "",
        className,
      )}
      aria-hidden={!open}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
}
