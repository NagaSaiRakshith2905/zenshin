"use client";

import { AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function ErrorBoundary({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main role="alert" className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><AlertCircleIcon aria-hidden="true" /></EmptyMedia>
          <EmptyTitle><h1>Unable to load Zenshin</h1></EmptyTitle>
          <EmptyDescription>Try loading this page again.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button onClick={retry}>Try again</Button></EmptyContent>
      </Empty>
    </main>
  );
}
