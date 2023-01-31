import { calculatePatch, diff } from '../state/patch'
import type { AnimatorCommand, AnimatorStep, Patch, Snapshot } from '../types'
import { sliceInput } from './slicing'

export function *patchSteps(input: string, patches: Patch[]): Generator<AnimatorStep> {
  let output = input
  let cursor = 0

  for (let index = 0; index < patches.length; index++) {
    const patch = patches[index]

    yield {
      type: 'patch-start',
      patch,
      index,
      total: patches.length,
    }

    if (patch.type === 'insert') {
      cursor = patch.cursor
      const head = output.slice(0, patch.cursor)
      const tail = output.slice(patch.cursor)
      for (const { char, output, cursor: delta } of animateInsertionSlices(patch.content)) {
        yield {
          type: 'insert',
          char,
          cursor: cursor + delta,
          content: head + output + tail,
        }
      }

      output = head + patch.content + tail
    }
    else if (patch.type === 'paste') {
      cursor = patch.cursor
      const head = output.slice(0, patch.cursor)
      const tail = output.slice(patch.cursor)
      const { content } = patch

      yield {
        type: 'paste',
        cursor: cursor + content.length,
        content,
      }

      output = head + patch.content + tail
    }
    else if (patch.type === 'removal') {
      cursor = patch.cursor - patch.length
      const head = output.slice(0, cursor)
      const tail = output.slice(patch.cursor)
      const selection = output.slice(cursor, patch.cursor)
      for (let i = selection.length - 1; i >= 0; i--) {
        yield {
          type: 'removal',
          cursor: cursor + i,
          content: head + selection.slice(0, i) + tail,
        }
      }
      output = head + tail
    }

    yield {
      type: 'patch-finish',
      content: output,
      index,
      total: patches.length,
    }
  }
}

function *exec(step: AnimatorStep): Generator<AnimatorStep> {
  try {
    yield step
  }
  catch (command) {
    yield { type: 'action-noop' }
    if (isCommand(command)) {
      switch (command.type) {
        case 'command-pause':
          yield * exec({ type: 'action-pause' })
          return
      }
      throw command
    }
  }
}

function isCommand(e: unknown): e is AnimatorCommand {
  return !!e && typeof e === 'object' && 'type' in e && ['command-stepBack', 'command-break', 'command-pause'].includes((e as any).type)
}

function* animateStep(index: number, total: number, snap: Snapshot, lastContent: string, forcePause: boolean): Generator<AnimatorStep> {
  yield * exec({
    type: 'snap-start',
    snap,
    initialContent: lastContent,
    forcePause,
    index,
    total,
  })

  const isPasted = snap.options?.paste

  const steps = stepsTo(lastContent, snap.content, isPasted)
  for (const step of steps)
    yield * exec(step)

  yield * exec({
    type: 'snap-finish',
    content: snap.content,
    snap,
    index,
    total,
  })
}

export function *animateSteps(snapshots: Snapshot[]): Generator<AnimatorStep> {
  const copy = [...snapshots]
  const total = copy.length
  let forcePause = false
  for (let index = 0; index < copy.length; index++) {
    try {
      const snap = copy[index]
      const lastContent = copy[index - 1]?.content ?? null
      if (lastContent == null) {
        yield * exec({
          type: 'init',
          content: snap.content,
        })
        continue
      }
      yield * animateStep(index, total, snap, lastContent, forcePause)
      forcePause = false
    }
    catch (command) {
      yield { type: 'action-noop' }
      if (isCommand(command)) {
        if (command.type === 'command-stepBack') {
          index -= 2
          forcePause = true
          continue
        }
        if (command.type === 'command-break')
          break
      }
      throw command
    }
  }
}

export function *animateInsertionSlices(input: string) {
  const slices = sliceInput(input)
  let output = ''
  for (const { content, cursor } of slices) {
    const head = output.slice(0, cursor)
    const tail = output.slice(cursor)

    let body = ''
    for (const char of content) {
      body += char
      yield {
        char,
        output: head + body + tail,
        cursor: cursor + body.length,
      }
    }
    output = head + content + tail
  }
}

export function stepsTo(input: string, output: string, isPasted?: boolean) {
  const delta = diff(input, output)
  const patches = calculatePatch(delta, isPasted)
  return patchSteps(input, patches)
}
