'use client';

import { useEffect } from 'react';

interface Props {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
}

export default function Toast({ message, type = 'success', onClose }: Props) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl text-white text-sm font-semibold whitespace-nowrap ${
        type === 'success' ? 'bg-green-500' : 'bg-red-500'
      }`}
    >
      {type === 'success' ? '✓ ' : '✕ '}
      {message}
    </div>
  );
}
