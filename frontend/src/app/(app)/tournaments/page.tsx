import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import View from "./view";

// The page content depends on the signed-in user (loaded client-side), so
// there is no meaningful static shell to validate for instant navigation.
export const instant = false;

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <View />
    </Suspense>
  );
}
