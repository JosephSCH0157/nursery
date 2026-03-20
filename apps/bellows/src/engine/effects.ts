import type {
  BellowsEngineEffect,
  BellowsEngineEffectType,
  BellowsSessionEventPayload,
} from "../domain/events.js";

const EMPTY_EFFECT_PAYLOAD = Object.freeze({}) as Record<string, never>;

export function declareBellowsEffect<
  TType extends BellowsEngineEffectType,
  TPayload extends BellowsSessionEventPayload = Record<string, never>,
>(
  type: TType,
  payload = EMPTY_EFFECT_PAYLOAD as TPayload,
): BellowsEngineEffect<TType, TPayload> {
  return {
    type,
    payload,
  };
}
