"use client";

import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useReducedMotion,
  AnimatePresence,
  type Variants,
} from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Shared motion vocabulary.
 *
 * One file so every page animates the same way. Motion here is meant to explain
 * state — where a thing came from, that a number changed, that something was
 * added — not to decorate. Durations are short (0.18–0.4s) and easing is a
 * single custom curve, because varied timings across a product read as
 * inconsistency rather than personality.
 *
 * Everything respects `prefers-reduced-motion`: the hooks below collapse to
 * instant, and globals.css neutralises CSS transitions.
 */

/** Slight overshoot on entry, none on exit. Feels responsive without bouncing. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

/** Parent for staggered lists. Children opt in with `fadeUp`. */
export const stagger: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.045, delayChildren: 0.04 },
  },
};

/**
 * Fades and lifts its children in sequence once scrolled into view.
 * `amount: 0.1` so a tall grid starts animating as soon as its top edge lands.
 */
export function StaggerIn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={stagger}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
    >
      {children}
    </motion.div>
  );
}

/** One item inside a `StaggerIn`. */
export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * Ordered-list variant of `StaggerIn`. Same motion, correct semantics — an audit
 * trail is a numbered sequence of events, so it stays an <ol>/<li> rather than a
 * pile of divs.
 */
export function StaggerList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.05 });

  return (
    <motion.ol
      ref={ref}
      className={className}
      variants={stagger}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
    >
      {children}
    </motion.ol>
  );
}

/** One item inside a `StaggerList`. */
export function StaggerListItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.li variants={fadeUp} className={className}>
      {children}
    </motion.li>
  );
}

/** Page-level entrance. Deliberately subtler than card entrances. */
export function PageIn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * A number that counts to its value instead of snapping.
 *
 * Money is passed in paise and formatted by the caller's `format`, so the
 * animation never invents a currency string of its own — the same formatter that
 * renders the static value renders every intermediate frame.
 */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  // Stiffness/damping tuned so a large rupee figure settles in ~0.9s without
  // overshooting past the real number, which would briefly show a wrong total.
  const spring = useSpring(motionValue, {
    stiffness: 70,
    damping: 22,
    mass: 0.9,
  });

  useEffect(() => {
    if (reduced) {
      if (ref.current) ref.current.textContent = format(value);
      return;
    }
    motionValue.set(value);
  }, [value, motionValue, reduced, format]);

  useEffect(() => {
    if (reduced) return;
    return spring.on("change", (latest) => {
      if (ref.current) ref.current.textContent = format(Math.round(latest));
    });
  }, [spring, format, reduced]);

  // Server-rendered content is the final value, so no-JS and reduced-motion
  // readers see the real number rather than a zero.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}

/** Hover/press feedback for cards. Lift is small — 2px reads as intent, 8px as a toy. */
export const cardHover = {
  whileHover: { y: -2, transition: { duration: 0.18, ease: EASE } },
  whileTap: { y: 0, scale: 0.995 },
};

/** Press feedback for buttons. */
export const pressable = {
  whileHover: { scale: 1.015, transition: { duration: 0.15, ease: EASE } },
  whileTap: { scale: 0.98 },
};

export { motion, AnimatePresence, useReducedMotion };
