import type { ReactNode } from "react";

type NavigationName = "catalog" | "stock" | "documents" | "reports" | "settings";

const shapes: Record<NavigationName, ReactNode> = {
  catalog: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.8" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.8" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.8" /><rect x="14" y="14" width="6.5" height="6.5" rx="1.8" /></>,
  stock: <><path d="m12 3 8.5 4.8v8.4L12 21l-8.5-4.8V7.8L12 3Z" /><path d="m3.5 7.8 8.5 4.8 8.5-4.8M12 12.6V21M7.8 5.4l8.5 4.8" /></>,
  documents: <><path d="M13.5 3.5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9l-6-6Z" /><path d="M13.5 3.5v4a2 2 0 0 0 2 2h4M8.5 13h7M8.5 16.5h4.5" /></>,
  reports: <><path d="M4 3.5v15a2 2 0 0 0 2 2h14M8 15l4-5 3.5 2.5 5-7" /><path d="M16.5 5.5h4v4" /></>,
  settings: <><path d="M4 6h4M12 6h8M4 12h10M18 12h2M4 18h3M11 18h9" /><circle cx="10" cy="6" r="2" /><circle cx="16" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></>,
};

export function NavigationIcon({ name }: { name: NavigationName }) {
  return <span className="nav-icon-frame" aria-hidden="true"><svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg></span>;
}
