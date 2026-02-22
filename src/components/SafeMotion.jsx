import React from 'react';
import { motion, AnimatePresence as FramerAnimatePresence } from 'framer-motion';

/**
 * Safe wrapper for framer-motion components.
 * 
 * IMPORTANT: framer-motion v11 can sometimes render custom elements like
 * <motion_button> instead of <button> when using motion.button directly.
 * This wrapper ensures we always get proper native HTML elements.
 */

// Safe motion.div wrapper - renders as real <div>
export const SafeMotionDiv = React.forwardRef(function SafeMotionDiv(props, ref) {
  const { children, className, style, onClick, ...motionProps } = props;
  try {
    return (
      <motion.div ref={ref} className={className} style={style} onClick={onClick} {...motionProps}>
        {children}
      </motion.div>
    );
  } catch (e) {
    console.warn('[SafeMotion] motion.div fallback:', e);
    return <div ref={ref} className={className} style={style} onClick={onClick}>{children}</div>;
  }
});

// Safe motion.button wrapper - renders as real <button>
// Uses a plain <button> with motion.div wrapper for animations to avoid
// the motion_button custom element issue
export const SafeMotionButton = React.forwardRef(function SafeMotionButton(props, ref) {
  const { 
    children, className, style, onClick, type = 'button', disabled,
    initial, animate, exit, whileHover, whileTap, transition,
    ...rest 
  } = props;
  
  try {
    // Use motion.div as wrapper for animation, with a real button inside
    // This avoids the motion_button custom element rendering issue
    return (
      <motion.div
        initial={initial}
        animate={animate}
        exit={exit}
        whileHover={whileHover}
        whileTap={whileTap}
        transition={transition}
        style={{ display: 'contents' }}
      >
        <button
          ref={ref}
          className={className}
          style={style}
          onClick={onClick}
          type={type}
          disabled={disabled}
        >
          {children}
        </button>
      </motion.div>
    );
  } catch (e) {
    console.warn('[SafeMotion] motion.button fallback:', e);
    return (
      <button ref={ref} className={className} style={style} onClick={onClick} type={type} disabled={disabled}>
        {children}
      </button>
    );
  }
});

// Safe AnimatePresence wrapper
export const SafeAnimatePresence = ({ children, mode, ...props }) => {
  try {
    return (
      <FramerAnimatePresence mode={mode} {...props}>
        {children}
      </FramerAnimatePresence>
    );
  } catch (e) {
    console.warn('[SafeMotion] AnimatePresence fallback:', e);
    return <>{children}</>;
  }
};
