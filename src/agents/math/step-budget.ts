/**
 * Reserves the last permitted step for a written reply.
 *
 * The agent may run up to MATH_MAX_STEPS model calls. Without a reserve, a turn
 * that is still calling tools on its last step ends with no text for the
 * student. On that step tools are switched off, using the same toolChoice
 * "none" setting the Physics agent already uses, so the model must write. The
 * prompt already forbids claiming a check that did not happen, so an unfinished
 * calculation is reported as unchecked rather than presented as verified.
 *
 * This bounds the number of model calls, not wall-clock time: the 60-second
 * function limit applies to the whole chat route and every agent, so a deadline
 * belongs there (an abort signal set by the route), not in one specialist.
 */
export const MATH_MAX_STEPS = 8;

export function isFinalStep(stepNumber: number) {
  return stepNumber >= MATH_MAX_STEPS - 1;
}
