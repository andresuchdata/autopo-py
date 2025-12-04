// /Users/andresuchitra/dev/missglam/autopo/web/src/app/page.tsx
"use client";

import { EnhancedDashboard } from "@/components/EnhancedDashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <EnhancedDashboard />
    </main>
  );
}