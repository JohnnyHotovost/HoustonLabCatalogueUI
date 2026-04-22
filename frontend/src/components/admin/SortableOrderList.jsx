import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Star } from "lucide-react";
import { SafeLogoImage } from "../SafeLogoImage";
import { Button } from "../ui/button";

const SortableTile = ({ link }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm ${
        isDragging ? "opacity-70 shadow-lg" : ""
      }`}
      data-testid={`sortable-link-${link.id}`}
    >
      <button
        type="button"
        className="rounded-xl border border-slate-200 p-2 text-slate-500"
        {...attributes}
        {...listeners}
        data-testid={`sortable-link-handle-${link.id}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
        <SafeLogoImage
          src={link.logo_data || link.logo_url}
          alt={link.title}
          className="h-full w-full object-contain"
          imageTestId={`sortable-link-logo-image-${link.id}`}
          fallbackClassName="flex h-full w-full items-center justify-center bg-slate-100 text-lg font-semibold text-slate-500"
          fallbackContent={<span>{link.title.charAt(0)}</span>}
          fallbackTestId={`sortable-link-logo-fallback-${link.id}`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-slate-900" data-testid={`sortable-link-title-${link.id}`}>
          {link.title}
        </div>
        <div className="text-sm text-slate-500" data-testid={`sortable-link-meta-${link.id}`}>
          Kliknutí: {link.clicks} • {link.is_active ? "Aktivní" : "Neaktivní"}
        </div>
      </div>

      {link.is_favorite ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : null}
    </div>
  );
};

export const SortableOrderList = ({ links, onChange, onSave, saving }) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = links.findIndex((link) => link.id === active.id);
    const newIndex = links.findIndex((link) => link.id === over.id);
    onChange(arrayMove(links, oldIndex, newIndex));
  };

  return (
    <section className="panel-surface p-6 md:p-7" data-testid="sortable-order-panel">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900" data-testid="sortable-order-title">
            Vlastní pořadí karet
          </h2>
          <p className="text-sm text-slate-500" data-testid="sortable-order-description">
            Přetáhni karty do pořadí, v jakém je mají zaměstnanci vidět.
          </p>
        </div>

        <Button
          type="button"
          className="rounded-xl bg-slate-900 hover:bg-slate-800"
          data-testid="sortable-order-save-button"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Ukládám pořadí..." : "Uložit pořadí"}
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={links.map((link) => link.id)} strategy={rectSortingStrategy}>
          <div className="grid gap-4 md:grid-cols-2" data-testid="sortable-order-grid">
            {links.map((link) => (
              <SortableTile key={link.id} link={link} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
};