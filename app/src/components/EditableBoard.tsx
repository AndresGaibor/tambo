import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useState } from "react";
import { Plus } from "lucide-react";
import { moveApp, moveGroup } from "../lib/edit";
import { useStore } from "../store";
import { GroupSection } from "./GroupSection";
import type { MenuPoint } from "./AppCard";
import type { AppEntry } from "../schema";

type SortableData = {
  type?: string;
  groupId?: string;
  sortable?: { containerId?: string | null };
};

/** Tablero del modo edición: reordena apps (dentro y entre grupos) y grupos. */
export function EditableBoard({
  onOpenMenu,
}: {
  onOpenMenu: (app: AppEntry, point: MenuPoint) => void;
}) {
  const config = useStore((s) => s.config);
  const save = useStore((s) => s.save);
  const openDrawer = useStore((s) => s.openDrawer);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!config) return null;

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    const current = useStore.getState().config;
    if (!current || !over || active.id === over.id) return;
    const activeData = active.data.current as SortableData | undefined;
    const overData = over.data.current as SortableData | undefined;

    if (activeData?.type === "group") {
      if (overData?.type !== "group") return;
      const to = current.groups.findIndex((group) => group.id === over.id);
      if (to >= 0) void save(moveGroup(current, String(active.id), to));
      return;
    }

    if (activeData?.type !== "app") return;
    const toGroupId = overData?.groupId ?? overData?.sortable?.containerId ?? null;
    if (!toGroupId) return;
    const target = current.groups.find((group) => group.id === toGroupId);
    if (!target) return;

    let index = target.apps.findIndex((app) => app.id === over.id);
    if (index < 0) index = target.apps.length;
    const fromGroupId = activeData.groupId;
    if (over.id !== active.id && fromGroupId === toGroupId) {
      const from = target.apps.findIndex((app) => app.id === active.id);
      if (from >= 0 && from < index) index -= 1;
    }
    void save(moveApp(current, String(active.id), toGroupId, index));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <DragOverlay>{activeId ? <div className="drag-overlay">{activeId}</div> : null}</DragOverlay>
      <p className="edit-hint">
        Modo edición: arrastra el asa de una tarjeta o grupo, o enfócala, pulsa Espacio o Enter y
        usa las flechas para moverla. También puedes abrir el menú y usar “Editar” para moverla de
        grupo con el formulario.
      </p>
      <SortableContext
        items={config.groups.map((group) => group.id)}
        strategy={verticalListSortingStrategy}
      >
        {config.groups.map((group) => (
          <GroupSection key={group.id} group={group} view="compact" onOpenMenu={onOpenMenu} />
        ))}
      </SortableContext>
      <button
        type="button"
        className="add-group"
        onClick={() => openDrawer({ mode: "group", groupId: null })}
      >
        <Plus size={16} strokeWidth={1.75} /> Agregar grupo
      </button>
    </DndContext>
  );
}
