import { useEffect, useState } from "react";

const useDebouncedState = (value: string, timeout = 500) => {
  const [debouncedState, setDebouncedState] = useState<string>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedState(value), timeout);
    return () => clearTimeout(timer);
  }, [value]);

  return debouncedState;
};

export default useDebouncedState;
