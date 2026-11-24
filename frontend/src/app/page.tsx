"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BlockSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { homeFor } from "@/lib/access";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(user ? (user.mustChangePassword ? "/change-password" : homeFor(user)) : "/login");
  }, [user, loading, router]);
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-64">
        <BlockSkeleton lines={3} />
      </div>
    </div>
  );
}
