export type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] }

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/

/** A tiny, dependency-free reader for the plain-text-with-markdown-habits JDs are written in. */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph })
    if (list.length) blocks.push({ kind: 'list', items: list })
    paragraph = []
    list = []
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1].length === 1 ? 2 : 3, text: heading[2] })
      continue
    }
    if (BULLET.test(line)) {
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', lines: paragraph })
        paragraph = []
      }
      list.push(line.replace(BULLET, '').trim())
      continue
    }
    if (list.length) {
      blocks.push({ kind: 'list', items: list })
      list = []
    }
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}
