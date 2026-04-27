import { useCallback, useEffect, useState } from "react";

export function useCopyToClipboard() {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = useCallback(async (text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isCopied) {
      return;
    }
    const timer = window.setTimeout(() => setIsCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  return { copyToClipboard, isCopied };
}
