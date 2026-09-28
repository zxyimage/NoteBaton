import { useSyncExternalStore, type ComponentProps } from "react";

export type Page = "home" | "note" | "download";
const page = (): Page => {
  if (/^\/note\/?$/.test(window.location.pathname)) return "note";
  if (/^\/download\/?$/.test(window.location.pathname)) return "download";
  return "home";
};
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
export function usePage() {
  return useSyncExternalStore(subscribe, page);
}

// Same-document navigation keeps the Note workspace and unsent drafts alive.
export function PageLink({
  href,
  onClick,
  ...props
}: ComponentProps<"a"> & { href: "/" | "/note" | "/download" }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== "_self")
        )
          return;
        event.preventDefault();
        if (window.location.pathname !== href) {
          window.history.pushState(null, "", href);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
        window.scrollTo({ top: 0, behavior: "instant" });
        document.getElementById("main-content")?.focus({ preventScroll: true });
      }}
    />
  );
}
