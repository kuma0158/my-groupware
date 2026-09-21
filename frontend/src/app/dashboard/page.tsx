import WidgetBoard from "@/components/WidgetBoard";
import { serverFetch } from "@/lib/server-api";
import type { Layout, Summary } from "@/lib/types";

export default async function DashboardPage() {
  const [summary, layout] = await Promise.all([
    serverFetch<Summary>("/dashboard/summary"),
    serverFetch<Layout>("/dashboard/layout"),
  ]);
  return (
    <>
      <h1>ホーム</h1>
      <WidgetBoard initial={layout.widgets} summary={summary} />
    </>
  );
}
