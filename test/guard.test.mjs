import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, inheritedPendingInput, name } from '../lib/index.js'

/** A structural Agent stub: the guard reads only the session header and the inbox. */
function agent({ seeded, nextTurn = [], nextStep = [] }) {
  const cleared = { count: 0 }
  return {
    id: 'session-stub',
    session: { header: { isSeeded: seeded } },
    inbox: {
      nextTurn,
      nextStep,
      clear() { cleared.count += 1 },
    },
    cleared,
  }
}

/** A structural Context stub that records listeners and log lines. */
function context() {
  const listeners = new Map()
  const logged = []
  return {
    ctx: {
      on(event, listener) { listeners.set(event, listener) },
      logger: { info(message) { logged.push(message) } },
    },
    emit(event, payload) {
      const listener = listeners.get(event)
      if (listener === undefined) throw new Error(`no listener for ${event}`)
      listener(payload)
    },
    logged,
  }
}

test('exports the plugin module name and a function plugin form', () => {
  assert.equal(name, 'dsh-fork-inbox-guard')
  assert.equal(typeof apply, 'function')
})

test('flags pending input a seeded startup agent inherited', () => {
  assert.equal(inheritedPendingInput(agent({ seeded: true, nextTurn: [{}] }), 'startup'), true)
  assert.equal(inheritedPendingInput(agent({ seeded: true, nextStep: [{}] }), 'startup'), true)
})

test('ignores a seeded startup agent whose inbox is already empty', () => {
  assert.equal(inheritedPendingInput(agent({ seeded: true }), 'startup'), false)
})

test('ignores a fresh session whose first prompt is pending', () => {
  assert.equal(inheritedPendingInput(agent({ seeded: false, nextTurn: [{}] }), 'startup'), false)
})

test('keeps the inbox of a resumed session, whose pending input is its own work', () => {
  assert.equal(inheritedPendingInput(agent({ seeded: true, nextTurn: [{}] }), 'resume'), false)
})

test('ignores clear and compact, which run on an agent that already exists', () => {
  assert.equal(inheritedPendingInput(agent({ seeded: true, nextTurn: [{}] }), 'clear'), false)
  assert.equal(inheritedPendingInput(agent({ seeded: true, nextTurn: [{}] }), 'compact'), false)
})

test('clears the inherited inbox at session start and logs the drop', () => {
  const harness = context()
  apply(harness.ctx)
  const forked = agent({ seeded: true, nextTurn: [{}] })
  harness.emit('agent/created', { agent: forked, source: 'startup' })
  assert.equal(forked.cleared.count, 1)
  assert.equal(harness.logged.length, 1)
  assert.match(harness.logged[0], /session-stub/)
})

test('leaves the inbox alone for every other start', () => {
  const harness = context()
  apply(harness.ctx)
  const resumed = agent({ seeded: true, nextTurn: [{}] })
  harness.emit('agent/created', { agent: resumed, source: 'resume' })
  const fresh = agent({ seeded: false, nextTurn: [{}] })
  harness.emit('agent/created', { agent: fresh, source: 'startup' })
  const empty = agent({ seeded: true })
  harness.emit('agent/created', { agent: empty, source: 'startup' })
  assert.equal(resumed.cleared.count, 0)
  assert.equal(fresh.cleared.count, 0)
  assert.equal(empty.cleared.count, 0)
  assert.deepEqual(harness.logged, [])
})
