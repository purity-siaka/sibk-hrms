"use client";

import { ErrorState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { BlockSkeleton } from "@/components/Skeleton";
import { TrainingPanel } from "@/components/TrainingPanel";
import { useAsync } from "@/hooks/useAsync";
import { api } from "@/lib/api";

export default function MyTraining() {
  const list = useAsync(() => api.training.mine(), []);
  return (
    <>
      <PageHeader title="My training" subtitle="Tell HR about training you plan to attend, whether you pay or SIBK does, and keep adding updates as it goes." />
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <BlockSkeleton lines={6} />
      ) : (
        <TrainingPanel items={list.data ?? []} onChange={list.reload} canAdd />
      )}
    </>
  );
}
