import ScheduleCalendar from "@/components/ScheduleCalendar";
import { serverFetch } from "@/lib/server-api";
import type { Event, User } from "@/lib/types";

export default async function SchedulePage() {
  const [events, me] = await Promise.all([serverFetch<Event[]>("/schedule/week"), serverFetch<User>("/auth/me")]);
  return (
    <>
      <h1>スケジュール</h1>
      <ScheduleCalendar initial={events} meId={me.id} />
    </>
  );
}
