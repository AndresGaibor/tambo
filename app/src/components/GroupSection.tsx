import type { ComponentType, CSSProperties } from "react";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, Plus, icons } from "lucide-react";
import type { Group } from "../schema";
import { useStore, type ViewMode } from "../store";
import { AppCard, type MenuPoint } from "./AppCard";

function GroupIcon({ icon }: { icon?: string }) {
  if (!icon) return null;
  if (icon.startsWith("lucide:")) {
    const name = icon
      .slice("lucide:".length)
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    const Cmp = (icons as Record<string, ComponentType<{ size?: number; strokeWidth?: number }>>)[
      name
    ];
    return Cmp ? <Cmp size={18} strokeWidth={1.75} /> : null;
  }
  return <span aria-hidden="true">{icon}</span>;
}

export function GroupSection({
  group,
  view,
  onOpenMenu,
}: {
  group: Group;
  view: ViewMode;
  onOpenMenu: (app: Group["apps"][number], point: MenuPoint) => void;
}) {
  const collapsed = useStore((s) => s.collapsed.includes(group.id));
  const editing = useStore((s) => s.editing);
  const toggleCollapse = useStore((s) => s.toggleCollapse);
  const openDetails = useStore((s) => s.openDetails);
  const openDrawer = useStore((s) => s.openDrawer);
  const sortable = useSortable({ id: group.id, data: { type: "group" }, disabled: !editing });

  return (
    <SortableContext
      id={group.id}
      items={group.apps.map((app) => app.id)}
      strategy={rectSortingStrategy}
    >
      <section
        ref={sortable.setNodeRef}
        className={`group${collapsed ? " collapsed" : ""}${sortable.isDragging ? " is-dragging" : ""}`}
        style={
          {
            "--g": `var(--c-${group.color})`,
            transform: CSS.Transform.toString(sortable.transform),
            transition: sortable.transition,
          } as CSSProperties
        }
      >
        <header className="group-head">
          {editing && (
            <button
              type="button"
              className="card-action-btn drag-handle"
              aria-label={`Arrastrar grupo ${group.name}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <GripVertical size={16} strokeWidth={1.75} />
            </button>
          )}
          <span className="group-bar" />
          <h2 className="group-name">
            <GroupIcon icon={group.icon} /> {group.name}
          </h2>
          <span className="group-count">
            {group.apps.length} {group.apps.length === 1 ? "app" : "apps"}
          </span>
          <button
            type="button"
            className="btn btn-icon btn-ghost group-collapse"
            data-collapsed={collapsed ? "true" : "false"}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expandir ${group.name}` : `Colapsar ${group.name}`}
            onClick={() => toggleCollapse(group.id)}
          >
            <ChevronDown size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="group-grid">
          {group.apps.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              group={group}
              color={group.color}
              view={view}
              onOpenMenu={onOpenMenu}
              onOpenDetails={openDetails}
            />
          ))}
          {editing && (
            <button
              type="button"
              className="add-card"
              onClick={() => openDrawer({ mode: "app", appId: null, groupId: group.id })}
            >
              <Plus size={16} strokeWidth={1.75} /> Agregar app
            </button>
          )}
        </div>
      </section>
    </SortableContext>
  );
}
