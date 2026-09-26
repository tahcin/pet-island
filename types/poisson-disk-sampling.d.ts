declare module "poisson-disk-sampling" {
  interface PoissonOptions {
    shape: number[];
    minDistance: number;
    maxDistance?: number;
    tries?: number;
  }
  export default class PoissonDiskSampling {
    constructor(options: PoissonOptions, rng?: () => number);
    fill(): number[][];
    addPoint(point: number[]): number[] | null;
  }
}
