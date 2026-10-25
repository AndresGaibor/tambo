/** Esqueleto de tarjeta para el estado de carga inicial. */
export function SkeletonCard() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <div className="skeleton-cover" />
      <div className="skeleton-body">
        <div className="skeleton-line skeleton-line-title" />
        <div className="skeleton-line skeleton-line-desc" />
        <div className="skeleton-line skeleton-line-foot" />
      </div>
    </div>
  );
}

/** Tablero esqueleto mostrado mientras carga la configuración. */
export function SkeletonBoard() {
  return (
    <div className="main" data-view="grid">
      <section className="group">
        <header className="group-head">
          <span className="group-bar" />
          <h2 className="group-name">Cargando…</h2>
        </header>
        <div className="group-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
