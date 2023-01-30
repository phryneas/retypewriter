import type { AnimatorStep, Snapshot, SnapshotOptions } from '../types'
import { getTimeout, randRange } from './timing'

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface TypewriterOptions {
  defaults?: SnapshotOptions
}

export async function *typingAnimator(
  steps: Generator<AnimatorStep>,

  options: TypewriterOptions = {},
): AsyncGenerator<AnimatorStep> {
  function getOptions(snap: Snapshot) {
    return {
      ...(options.defaults || {}),
      ...(snap.options || {}),
    }
  }

  let currentStepOptions = options.defaults ?? {}

  for (const step of steps) {
    const queue = [step]
    switch (step.type) {
      case 'init':
        break
      case 'snap-start':
        currentStepOptions = getOptions(step.snap)
        if (step.index) {
          const { wait } = currentStepOptions

          await sleep(wait !== undefined ? wait : randRange(700, 1000))
        }
        if (currentStepOptions.pause || step.forcePause)
          queue.push({ type: 'action-pause' })
        break
      case 'patch-start':
        if (step.index)
          await sleep(randRange(200, 500))
        break
      case 'insert':
        await sleep(getTimeout(step.char, currentStepOptions.speed ?? 1.2))
        break
      case 'paste':
        await sleep(randRange(100, 200))
        break
      case 'removal':
        await sleep(randRange(0, 5))
        break
    }

    try {
      for (const s of queue)
        yield s
    }
    catch (e) {
      const result = steps.throw(e)
      if (!result.done)
        yield result.value
    }
  }
}
