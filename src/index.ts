/**
 * Drop the pending prompts a forked Session inherited from its source.
 *
 * A fork seeds the child with a prefix of the source's event log. The branch
 * cut runs from the boundary `turn/end` forward to the next `turn/start`, so an
 * `agent/inbox/spliced` insertion the source had not claimed yet lands inside
 * the seed while the claim that removes it, which happens right after the next
 * `turn/start`, stays behind. The child's inbox projection then reads that
 * message as still pending, and the child's first turn claims the source
 * session's prompt instead of the one the operator just typed.
 *
 * Pending input is live state, not history: it describes what one Agent is
 * about to run, and that Agent is the source, not the child. This plugin
 * therefore clears the inbox of every Agent built from a seed, at the boundary
 * where it is created.
 *
 * @module dsh-fork-inbox-guard
 */

import type { Agent, SessionStartSource } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-fork-inbox-guard'

export function apply(ctx: Context): void {
  ctx.on('agent/session-start', (payload: { agent: Agent; source: SessionStartSource }) => {
    if (!inheritedPendingInput(payload.agent, payload.source)) return
    payload.agent.inbox.clear()
    ctx.logger.info(
      `fork-inbox-guard: dropped the pending inbox of seeded session "${payload.agent.id}"`,
    )
  })
}

/**
 * Whether one newly started Agent carries pending input that belongs to
 * another Session.
 *
 * `startup` is the source every `agents.create()` publishes, and `resume` is
 * the only other source that builds an Agent over an existing log. A resume
 * must keep its inbox: those messages were queued for that same Session and
 * are still its work. `clear` and `compact` operate on an Agent that is already
 * running, so they never describe a fork child.
 * @param agent - the Agent whose lifecycle just started.
 * @param source - how that lifecycle started.
 * @returns whether the Agent's pending input was inherited rather than queued for it.
 */
export function inheritedPendingInput(agent: Agent, source: SessionStartSource): boolean {
  if (source !== 'startup') return false
  if (!agent.session.header.isSeeded) return false
  return agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0
}
