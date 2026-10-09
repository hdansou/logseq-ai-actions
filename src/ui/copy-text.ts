/**
 * Copy text from the plugin iframe. It is cross-origin with Logseq's window,
 * so the async clipboard API may be refused (no clipboard-write permission
 * policy on the frame); fall back to the legacy `execCommand("copy")`, which
 * works inside a click handler.
 */
export interface CopyDeps {
  readonly writeText?: (text: string) => Promise<void>;
  readonly execCopy: (text: string) => boolean;
}

export async function copyText(text: string, deps: CopyDeps = browserCopyDeps()): Promise<boolean> {
  if (deps.writeText) {
    try {
      await deps.writeText(text);
      return true;
    } catch {
      /* fall through to execCommand */
    }
  }
  try {
    return deps.execCopy(text);
  } catch {
    return false;
  }
}

function browserCopyDeps(): CopyDeps {
  const clipboard = globalThis.navigator?.clipboard;
  return {
    ...(clipboard ? { writeText: (t: string) => clipboard.writeText(t) } : {}),
    execCopy: (t) => {
      const area = document.createElement("textarea");
      area.value = t;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        return document.execCommand("copy");
      } finally {
        area.remove();
      }
    },
  };
}
