'use client';

import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

interface PasswordToggleButtonProps {
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_CLASS =
  'absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50';

export function PasswordToggleButton({ visible, onToggle, disabled, className }: PasswordToggleButtonProps) {
  const [blinkKey, setBlinkKey] = useState(0);

  return (
    <button
      type="button"
      onClick={() => { setBlinkKey((k) => k + 1); onToggle(); }}
      disabled={disabled}
      tabIndex={-1}
      aria-label={visible ? 'Hide password' : 'Show password'}
      className={className ?? DEFAULT_CLASS}
    >
      <span key={blinkKey} className="inline-block animate-eye-blink">
        {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </span>
    </button>
  );
}
