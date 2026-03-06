'use client';

import { useState, useEffect } from 'react';

interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  screenWidth: number;
  deviceType: 'mobile' | 'tablet' | 'desktop';
}

/**
 * Hook to detect device type (mobile, tablet, desktop)
 * Uses combination of screen width and user agent for accuracy
 */
export function useDevice(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isTouch: false,
    screenWidth: 1024,
    deviceType: 'desktop',
  });

  useEffect(() => {
    const detectDevice = () => {
      const width = window.innerWidth;
      const userAgent = navigator.userAgent.toLowerCase();

      // Check for touch capability
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      // User agent based detection
      const mobileKeywords = [
        'android',
        'webos',
        'iphone',
        'ipod',
        'blackberry',
        'windows phone',
        'opera mini',
        'mobile',
      ];
      const tabletKeywords = ['ipad', 'tablet', 'playbook', 'silk'];

      const isMobileUA = mobileKeywords.some((keyword) =>
        userAgent.includes(keyword)
      );
      const isTabletUA = tabletKeywords.some((keyword) =>
        userAgent.includes(keyword)
      );

      // Screen width based detection (breakpoints)
      // Mobile: < 768px, Tablet: 768-1024px, Desktop: > 1024px
      const isMobileWidth = width < 768;
      const isTabletWidth = width >= 768 && width < 1024;

      // Combine both methods for accuracy
      const isMobile = isMobileUA || (isMobileWidth && !isTabletUA);
      const isTablet = isTabletUA || (isTabletWidth && isTouch);
      const isDesktop = !isMobile && !isTablet;

      let deviceType: 'mobile' | 'tablet' | 'desktop' = 'desktop';
      if (isMobile) deviceType = 'mobile';
      else if (isTablet) deviceType = 'tablet';

      setDeviceInfo({
        isMobile,
        isTablet,
        isDesktop,
        isTouch,
        screenWidth: width,
        deviceType,
      });
    };

    // Initial detection
    detectDevice();

    // Listen for resize events
    window.addEventListener('resize', detectDevice);

    return () => {
      window.removeEventListener('resize', detectDevice);
    };
  }, []);

  return deviceInfo;
}

/**
 * Simple hook to check if screen is mobile-sized
 * Useful for quick responsive checks
 */
export function useIsMobile(breakpoint: number = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [breakpoint]);

  return isMobile;
}
