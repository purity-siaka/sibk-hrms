"use client";

import { LeaveReportsView } from "@/components/LeaveReportsView";
import { PageHeader } from "@/components/PageHeader";

export default function LeaveReports() {
  return (
    <>
      <PageHeader title="Leave reports" subtitle="Everything about leave across the bank, including managers' comments and employees' reasons." />
      <LeaveReportsView intro="Pick a report. Export to Excel downloads it as an Excel file. In the balances report the last column shows the unused annual-leave days that carry forward." />
    </>
  );
}
