"use client";

import {
  useEffect,
  useRef,
} from "react";
import {ArrowLeft, Search, X} from "lucide-react";

interface SearchHeaderProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function SearchHeader({
  value,
  onChange,
  onClear,
  onBack,
  onSubmit,
}: SearchHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /*
     * autoFocus is occasionally lost during an App Router transition on
     * mobile. Explicitly restoring focus keeps the keyboard open after the
     * customer taps the search field on Home.
     */
    const focusInput = () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      input.focus({
        preventScroll: true,
      });
      input.setSelectionRange(input.value.length, input.value.length);
    };
    const frame = window.requestAnimationFrame(focusInput);
    const firstRetry = window.setTimeout(focusInput, 160);
    const secondRetry = window.setTimeout(focusInput, 360);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(firstRetry);
      window.clearTimeout(secondRetry);
    };
  }, []);

  return (
    <div className="sticky top-0 z-20 bg-white/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center gap-2">
        <button
          onClick={onBack}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gray-50 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>

        <div className="relative flex-1 rounded-full bg-white shadow-lg ring-1 ring-gray-200">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit();
              }
            }}
            placeholder="Search products, stores..."
            className="w-full rounded-full bg-transparent py-3 pl-11 pr-11 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-sm"
            autoFocus
          />
          {value && (
            <button
              onClick={onClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 transition hover:bg-gray-100"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
