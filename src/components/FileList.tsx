import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import type { Item } from "../lib/types";
import { FileCard } from "./FileCard";

interface Props {
  items: Item[];
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onRotate: (id: string) => void;
  onRetry: (id: string) => void;
}

export function FileList({ items, onMove, onRemove, onRotate, onRetry }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    onMove(from, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2" aria-label="Files in output order">
          {items.map((item, index) => (
            <FileCard key={item.id} item={item} index={index} count={items.length} onMove={onMove} onRemove={onRemove} onRotate={onRotate} onRetry={onRetry} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
