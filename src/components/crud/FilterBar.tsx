"use client";

export function FilterBar({
  left,
  right
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-col sm:flex-row">
      <div className="flex items-center gap-3 flex-wrap">{left}</div>
      <div className="flex items-center gap-3 flex-wrap justify-end">{right}</div>
    </div>
  );
}

