import { useEffect, useMemo, useRef, type Ref } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import type * as THREE from "three";
import { hashJson, type PetSpec } from "../schema/petReading";
import { buildPet, disposePet } from "./buildPet";
import { PetAnimator, type PetAnimState } from "./petAnimator";

export type PetProps = Omit<ThreeElements["group"], "ref" | "children"> & {
  spec: PetSpec;
  /** Animation state; changes cross-fade over 0.2 s. */
  state?: PetAnimState;
  /** Movement speed 0 to 1 for walk and run. Omit to use the state default. */
  move?: number;
  /** Receives the animator once built (and null on unmount or rebuild). */
  animatorRef?: (animator: PetAnimator | null) => void;
  /** Receives the built pet group (metrics in group.userData, see petData()). */
  onBuilt?: (pet: THREE.Group) => void;
  /** Stop ticking the animator (the pet holds its last pose). */
  paused?: boolean;
  ref?: Ref<THREE.Group>;
};

/**
 * R3F wrapper around buildPet and PetAnimator. The outer group takes position, rotation, and
 * any other group props; the pet itself is rebuilt only when the spec content changes.
 */
export default function Pet({ spec, state = "idle", move, animatorRef, onBuilt, paused, ref, ...rest }: PetProps) {
  const key = hashJson(spec);
  const pet = useMemo(() => buildPet(spec), [key]);
  const animator = useMemo(() => new PetAnimator(pet), [pet]);
  const cbRef = useRef(animatorRef);
  cbRef.current = animatorRef;

  useEffect(() => {
    onBuilt?.(pet);
    return () => disposePet(pet);
  }, [pet]);

  useEffect(() => {
    cbRef.current?.(animator);
    return () => cbRef.current?.(null);
  }, [animator]);

  useEffect(() => {
    animator.setState(state);
  }, [animator, state]);

  useEffect(() => {
    animator.setMove(move ?? -1);
  }, [animator, move]);

  useFrame((s, dt) => {
    if (!paused) animator.update(dt, s.clock.elapsedTime);
  });

  return (
    <group ref={ref} {...rest}>
      <primitive object={pet} />
    </group>
  );
}
