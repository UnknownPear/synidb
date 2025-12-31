import { useState, useEffect } from 'react';

/**
 * A custom React hook that debounces a value.
 *
 * @param value The value to debounce.
 * @param delay The debounce delay in milliseconds.
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay: number): T {
  // State and setters for debounced value
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(
    () => {
      // Update debounced value after the specified delay
      const handler = setTimeout(() => {
        setDebouncedValue(value);
      }, delay);

      // Cancel the timeout if the value changes (also on delay change or unmount).
      // This is how we prevent the debounced value from updating if the value is changed
      // within the delay period. The timeout gets cleared and restarted.
      return () => {
        clearTimeout(handler);
      };
    },
    [value, delay] // Only re-call the effect if the value or delay changes
  );

  return debouncedValue;
}