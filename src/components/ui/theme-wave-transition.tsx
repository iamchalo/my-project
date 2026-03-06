'use client';

import { useEffect, useRef } from 'react';

export function useThemeWaveTransition() {
  const animationRef = useRef<number | null>(null);

  const triggerWaveTransition = (
    clickX: number,
    clickY: number,
    newTheme: 'light' | 'dark',
    onComplete?: () => void
  ) => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Create canvas for animation
    const canvas = document.createElement('canvas');
    canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
    `;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      canvas.remove();
      return;
    }

    // Store old theme color
    const oldThemeColor = document.documentElement.classList.contains('dark')
      ? '#0a0a0a'
      : '#ffffff';

    // Apply new theme immediately
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }

    // Calculate max radius to cover entire screen
    const maxRadius = Math.hypot(
      Math.max(clickX, window.innerWidth - clickX),
      Math.max(clickY, window.innerHeight - clickY)
    );

    const duration = 700;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const radius = maxRadius * eased;

      // Clear and draw
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = oldThemeColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Cut circle
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(clickX, clickY, radius, 0, Math.PI * 2);
      ctx.fill();

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        canvas.remove();
        animationRef.current = null;
        onComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return { triggerWaveTransition };
}
