export interface HasPosition {
  x: number;
  y: number;
  radius: number;
}

/**
 * 2D Spatial Partitioning Grid for high-performance collision detection
 * Handles 1,000+ entities at smooth 60 FPS.
 */
export class SpatialGrid<T extends HasPosition> {
  private cellSize: number;
  private grid: Map<string, T[]> = new Map();

  constructor(cellSize: number = 120) {
    this.cellSize = cellSize;
  }

  public clear() {
    this.grid.clear();
  }

  private getKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  public insert(entity: T) {
    const minCx = Math.floor((entity.x - entity.radius) / this.cellSize);
    const maxCx = Math.floor((entity.x + entity.radius) / this.cellSize);
    const minCy = Math.floor((entity.y - entity.radius) / this.cellSize);
    const maxCy = Math.floor((entity.y + entity.radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = this.getKey(cx, cy);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(entity);
      }
    }
  }

  public query(x: number, y: number, radius: number): T[] {
    const results: Set<T> = new Set();
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);

    const r2 = radius * radius;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const list = this.grid.get(this.getKey(cx, cy));
        if (list) {
          for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const dx = item.x - x;
            const dy = item.y - y;
            const combinedR = radius + item.radius;
            if (dx * dx + dy * dy <= combinedR * combinedR) {
              results.add(item);
            }
          }
        }
      }
    }

    return Array.from(results);
  }

  public getNearest(x: number, y: number, maxRadius: number): T | null {
    const nearby = this.query(x, y, maxRadius);
    let nearest: T | null = null;
    let minDistSq = maxRadius * maxRadius;

    for (const item of nearby) {
      const dx = item.x - x;
      const dy = item.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = item;
      }
    }

    return nearest;
  }
}
