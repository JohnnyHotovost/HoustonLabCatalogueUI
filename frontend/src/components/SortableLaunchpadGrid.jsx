import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LinkCard } from "./LinkCard";

const SortableLaunchpadCard = ({ link, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-80" : ""}
      {...attributes}
      {...listeners}
      data-testid={`launchpad-sortable-card-${link.id}`}
    >
      <LinkCard link={link} index={index} dragEnabled />
    </div>
  );
};

export const SortableLaunchpadGrid = ({ links, onChange }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
  );

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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={links.map((link) => link.id)} strategy={rectSortingStrategy}>
        <section
          className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-8"
          data-testid="launchpad-sortable-grid"
        >
          {links.map((link, index) => (
            <SortableLaunchpadCard key={link.id} link={link} index={index} />
          ))}
        </section>
      </SortableContext>
    </DndContext>
  );
};