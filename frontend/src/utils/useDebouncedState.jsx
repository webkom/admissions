import { useEffect, useState } from "react";

const useDebouncedState = (value, timeout = 500) => {
  const [debouncedState, setDebouncedState] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedState(value), timeout);
    return () => clearTimeout(timer);
  }, [value]);

  return debouncedState;
};

export default useDebouncedState;
