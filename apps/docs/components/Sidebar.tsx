"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "../lib/nav";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="sidebar" aria-label="Documentation">
      {NAV.map((section) => (
        <div key={section.title} className="sidebar-section">
          <p className="sidebar-section-title">{section.title}</p>
          <ul>
            {section.links.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={active ? "sidebar-link active" : "sidebar-link"}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
