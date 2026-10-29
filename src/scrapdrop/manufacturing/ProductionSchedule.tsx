import { useMemo, useRef } from "react";
import { BryntumSchedulerPro } from "@bryntum/schedulerpro-react";
import "@bryntum/schedulerpro/schedulerpro.css";
import "@bryntum/schedulerpro/stockholm-light.css";
import "@bryntum/schedulerpro/fontawesome/css/fontawesome.css";
import "@bryntum/schedulerpro/fontawesome/css/solid.css";
import type { Slot } from "./engine";
export default function ProductionSchedule({
  slots,
  date,
  onEdit,
}: {
  slots: Slot[];
  date: string;
  onEdit: (slots: Slot[]) => void;
}) {
  const origin = new Date(date + "T09:00:00+08:00").getTime();
  const ref = useRef<BryntumSchedulerPro>(null);
  // The wrapper must keep the same project instance for unchanged schedule data.
  // Reloading or rejecting an edit can return an equivalent new slots array.
  const scheduleKey = JSON.stringify(slots);
  const project = useMemo(
    () => ({
      startDate: new Date(origin),
      hoursPerDay: 8,
      daysPerWeek: 7,
      calendar: "workshop",
      calendars: [
        {
          id: "workshop",
          name: "Workshop 09–17 MYT",
          unspecifiedTimeIsWorking: false,
          intervals: Array.from({ length: 75 }, (_, day) => ({
            startDate: new Date(origin + day * 1440 * 60000),
            endDate: new Date(origin + (day * 1440 + 480) * 60000),
            isWorking: true,
          })),
        },
      ],
      resources: [
        { id: "maker", name: "Maker" },
        { id: "cutter", name: "Cutting station" },
      ],
      events: slots.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: new Date(origin + s.start * 60000),
        duration: s.minutes,
        durationUnit: "minute",
        manuallyScheduled: false,
        constraintType: "startnoearlierthan",
        constraintDate: new Date(origin + s.start * 60000),
      })),
      assignments: slots.flatMap((s) =>
        s.resources.map((r) => ({
          id: s.id + "-" + r,
          eventId: s.id,
          resourceId: r,
        })),
      ),
      dependencies: (() => {
        const edges = new Map<
          string,
          { id: string; from: string; to: string; type: number }
        >();
        const add = (from: string, to: string) =>
          edges.set(from + "->" + to, {
            id: from + "->" + to,
            from,
            to,
            type: 2,
          });
        slots.forEach((s) => s.predecessors.forEach((p) => add(p, s.id)));
        // Preserve the validated resource order so a drag propagates through shared work.
        const last = new Map<string, string>();
        for (const s of [...slots].sort(
          (a, b) => a.start - b.start || a.id.localeCompare(b.id),
        )) {
          for (const resource of s.resources) {
            const previous = last.get(resource);
            if (previous && previous !== s.id) add(previous, s.id);
            last.set(resource, s.id);
          }
        }
        return [...edges.values()];
      })(),
    }),
    [scheduleKey, origin],
  );
  const changed = () => {
    const instance = ref.current?.instance;
    if (!instance) return;
    void instance.project.commitAsync().then(() => {
      const next = slots.map((s) => {
        const e = instance.eventStore.getById(s.id) as any;
        return {
          ...s,
          start: (e.startDate.getTime() - origin) / 60000,
          end: (e.endDate.getTime() - origin) / 60000,
        };
      });
      onEdit(next);
    });
  };
  return (
    <div className="mfg-schedule">
      <BryntumSchedulerPro
        key={date + slots.map((s) => `${s.id}:${s.start}:${s.end}`).join("|")}
        ref={ref}
        project={project as any}
        startDate={new Date(origin)}
        endDate={
          new Date(origin + Math.max(480, ...slots.map((s) => s.end)) * 60000)
        }
        viewPreset="hourAndDay"
        height={480}
        columns={[{ text: "Resource", field: "name", width: 170 }]}
        readOnly={false}
        eventEditFeature={false}
        eventDragCreateFeature={false}
        eventResizeFeature={false}
        eventDragFeature={{ constrainDragToResource: true }}
        allowOverlap={true}
        dependenciesFeature={true}
        onEventDrop={changed}
      />
    </div>
  );
}
