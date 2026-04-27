import { BotIcon, FolderIcon } from "lucide-react";
import { useState } from "react";
import { resolveServerUrl } from "~/lib/utils";
import { isNexEmbedded } from "../nex/embed-config";

const loadedProjectFaviconSrcs = new Set<string>();

export function ProjectFavicon({ cwd, className }: { cwd: string; className?: string }) {
  const shouldFetchFavicon = isLikelyFilesystemPath(cwd);
  const src = resolveServerUrl({
    protocol: "http",
    pathname: "/api/project-favicon",
    searchParams: { cwd },
  });
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(() =>
    shouldFetchFavicon && loadedProjectFaviconSrcs.has(src) ? "loaded" : shouldFetchFavicon ? "loading" : "error",
  );

  return (
    <>
      {status !== "loaded" ? (
        isNexEmbedded() && !shouldFetchFavicon ? (
          <BotIcon className={`size-3.5 shrink-0 text-muted-foreground/60 ${className ?? ""}`} />
        ) : (
          <FolderIcon
            className={`size-3.5 shrink-0 text-muted-foreground/50 ${className ?? ""}`}
          />
        )
      ) : null}
      {shouldFetchFavicon ? (
        <img
          src={src}
          alt=""
          className={`size-3.5 shrink-0 rounded-sm object-contain ${status === "loaded" ? "" : "hidden"} ${className ?? ""}`}
          onLoad={() => {
            loadedProjectFaviconSrcs.add(src);
            setStatus("loaded");
          }}
          onError={() => setStatus("error")}
        />
      ) : null}
    </>
  );
}

function isLikelyFilesystemPath(cwd: string): boolean {
  return cwd.startsWith("/") || /^[A-Za-z]:[\\/]/.test(cwd);
}
