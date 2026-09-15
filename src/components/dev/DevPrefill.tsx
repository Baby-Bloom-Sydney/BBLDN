'use client';

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

interface DevPrefillProps {
  onPrefill: () => void;
}

export function DevPrefill({ onPrefill }: DevPrefillProps) {
  if (!isDevMode) return null;

  return (
    <button
      onClick={onPrefill}
      className="fixed bottom-4 left-4 z-[9998] bg-violet-600 hover:bg-violet-700 text-white text-xs font-mono px-3 py-2 rounded-full shadow-lg transition-colors"
    >
      Prefill
    </button>
  );
}
