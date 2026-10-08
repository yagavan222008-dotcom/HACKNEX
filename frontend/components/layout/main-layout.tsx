"use client";

import type React from "react";
import AppShell from "./AppShell";

export function MainLayout({
  children,
}: {
  children: React.ReactNode;
  noPadding?: boolean;
  noScroll?: boolean;
}) {
  return <AppShell>{children}</AppShell>;
}
