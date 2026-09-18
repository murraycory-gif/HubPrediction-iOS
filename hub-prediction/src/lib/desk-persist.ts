/** Host + browser persist. Soft FAIL update-desk wipe. Soft FAIL Live master ON default. */

export type HostDeskState = {
  asOf: number
  settings?: unknown
  tickets?: unknown
  finance?: unknown
  hits?: unknown
}

type Writer = (patch: HostDeskState) => void

let writer: Writer | null = null

export function setHostDeskWriter(fn: Writer | null) {
  writer = fn
}

export function pushHostDesk(patch: Omit<HostDeskState, 'asOf'>) {
  if (!writer) return
  writer({ ...patch, asOf: Date.now() })
}
