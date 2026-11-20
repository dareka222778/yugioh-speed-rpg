export type DuelTeam = 0 | 1;
export type PhysicalSeat = 0 | 1 | 2 | 3;
export type SetCardZone = "monster" | "backrow" | "field";

export interface SetCardSnapshot {
  uid: string;
  id: string;
  name: string;
  physicalOwnerSeat: number;
  controllerTeam: DuelTeam;
  zone: SetCardZone;
  index: number;
  faceUp: boolean;
  position?: "atk" | "def";
}

export interface PrivateSetInspectionRequest {
  triggerWindow: "normalSummon" | "controllerStandby";
  resolverSeat: number;
  resolverTeam: DuelTeam;
  target: SetCardSnapshot;
}

export interface PrivateSetInspectionResult {
  resolverSeat: PhysicalSeat;
  target: SetCardSnapshot;
}

export type InspectionViewer =
  | { kind: "public" }
  | { kind: "seat"; seat: number };

export interface PrivateInspectionProjection {
  inspected: true;
  faceDown: true;
  zone: SetCardZone;
  targetUid: string;
  cardId: string;
  cardName: string;
  physicalOwnerSeat: PhysicalSeat;
  revealedToViewer: true;
}

export interface RedactedInspectionProjection {
  inspected: true;
  faceDown: true;
  zone: SetCardZone;
  revealedToViewer: false;
}

export type InspectionProjection = PrivateInspectionProjection | RedactedInspectionProjection;

function assertSeat(value: number, label: string): asserts value is PhysicalSeat {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(label + " must be a physical seat from 0 to 3.");
  }
}

function assertTeam(value: number, label: string): asserts value is DuelTeam {
  if (value !== 0 && value !== 1) throw new Error(label + " must be team 0 or 1.");
}

/**
 * A Man with Wdjat may inspect one face-down card controlled by the opposing
 * team only on its Normal Summon or its controller's Standby Phase.
 * The operation is observational: it does not flip, move, or mutate the card.
 */
export function inspectOpponentSetCard(
  request: PrivateSetInspectionRequest,
): PrivateSetInspectionResult | null {
  const resolverSeat = request.resolverSeat;
  assertSeat(resolverSeat, "resolverSeat");
  assertTeam(request.resolverTeam, "resolverTeam");
  const target = request.target;
  if (!target || typeof target.uid !== "string" || !target.uid.trim()) {
    throw new Error("target physical UID is required.");
  }
  if (typeof target.id !== "string" || !target.id.trim()) throw new Error("target card ID is required.");
  if (typeof target.name !== "string" || !target.name.trim()) throw new Error("target card name is required.");
  assertSeat(target.physicalOwnerSeat, "physicalOwnerSeat");
  assertTeam(target.controllerTeam, "target controllerTeam");
  if (!["monster", "backrow", "field"].includes(target.zone)) throw new Error("invalid target zone.");
  if (!Number.isSafeInteger(target.index) || target.index < 0) throw new Error("target zone index must be non-negative.");
  if (request.triggerWindow !== "normalSummon" && request.triggerWindow !== "controllerStandby") return null;
  if (target.faceUp || target.controllerTeam === request.resolverTeam) return null;
  if (target.zone === "monster" && target.position !== "def") return null;

  return {
    resolverSeat,
    target: { ...target },
  };
}

/**
 * Only the physical seat resolving the effect receives the hidden identity.
 * Public output and every other seat (including the resolver's partner) get
 * a redacted projection without UID, card ID, name, or physical owner.
 */
export function projectPrivateSetInspection(
  result: PrivateSetInspectionResult,
  viewer: InspectionViewer,
): InspectionProjection {
  if (viewer.kind === "seat") {
    assertSeat(viewer.seat, "viewer.seat");
    const physicalOwnerSeat = result.target.physicalOwnerSeat;
    assertSeat(physicalOwnerSeat, "physicalOwnerSeat");
    if (viewer.seat === result.resolverSeat) {
      return {
        inspected: true,
        faceDown: true,
        zone: result.target.zone,
        targetUid: result.target.uid,
        cardId: result.target.id,
        cardName: result.target.name,
        physicalOwnerSeat,
        revealedToViewer: true,
      };
    }
  } else if (viewer.kind !== "public") {
    throw new Error("invalid inspection viewer.");
  }

  return {
    inspected: true,
    faceDown: true,
    zone: result.target.zone,
    revealedToViewer: false,
  };
}

/** Restore the exact physical snapshot after the private peek; no reveal state persists. */
export function restoreInspectedSetCard(result: PrivateSetInspectionResult): SetCardSnapshot {
  return { ...result.target };
}
