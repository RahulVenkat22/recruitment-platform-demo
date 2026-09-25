import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/** A candidate name to turn into a link wherever the answer mentions it. */
export interface NameLink {
  name: string
  href: string
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; lines: string[] }

const BULLET = /^\s*(?:[-*•]|(\d+)[.)])\s+/
const HEADING = /^#{1,4}\s+(.*)$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
/** `**bold**`, `` `code` ``, `*italic*` and `_italic_`, never inside a word. */
const INLINE =
  /(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![\w*])\*(?!\s)[^*\n]+?(?<!\s)\*(?![\w*])|(?<!\w)_(?!\s)[^_\n]+?(?<!\s)_(?!\w))/g

/** The markdown habits a model answer has, read leniently so a half-streamed answer still renders. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', lines: paragraph })
    if (list) blocks.push({ kind: 'list', ...list })
    paragraph = []
    list = null
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim() || RULE.test(line)) {
      flush()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', text: heading[1] })
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      const ordered = bullet[1] !== undefined
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', lines: paragraph })
        paragraph = []
      }
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push({ kind: 'list', ...list })
        list = { ordered, items: [] }
      }
      list.items.push(line.slice(bullet[0].length).trim())
      continue
    }
    if (list) {
      blocks.push({ kind: 'list', ...list })
      list = null
    }
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function linkNames(text: string, links: NameLink[] | undefined, key: string): ReactNode[] {
  if (!links || links.length === 0 || !text) return [text]
  const names = [...links].sort((a, b) => b.name.length - a.name.length)
  const pattern = new RegExp(
    `(?<!\\w)(${names.map((l) => escapeRegExp(l.name)).join('|')})(?!\\w)`,
    'gi',
  )
  const nodes: ReactNode[] = []
  let last = 0
  let count = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > last) nodes.push(text.slice(last, start))
    const link = names.find((l) => l.name.toLowerCase() === match[0].toLowerCase())
    nodes.push(
      <Link
        key={`${key}-${count++}`}
        to={link?.href ?? '#'}
        className="font-medium text-primary underline decoration-primary/40 decoration-[1.5px] underline-offset-2 transition-colors duration-150 ease-brand hover:decoration-primary"
      >
        {match[0]}
      </Link>,
    )
    last = start + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function renderInline(text: string, links: NameLink[] | undefined, key: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let count = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0
    if (start > last) nodes.push(...linkNames(text.slice(last, start), links, `${key}-t${count}`))
    const token = match[0]
    const inner = `${key}-i${count}`
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={inner} className="font-semibold text-ink">
          {linkNames(token.slice(2, -2), links, inner)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={inner} className="rounded-[3px] bg-surface-3 px-1 py-px font-mono text-[12.5px]">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(<em key={inner}>{linkNames(token.slice(1, -1), links, inner)}</em>)
    }
    last = start + token.length
    count += 1
  }
  if (last < text.length) {
    const rest = text.slice(last)
    // A `**` with no closing pair is a bold phrase still being streamed: show it bold rather
    // than as two literal asterisks that vanish a moment later.
    const open = rest.indexOf('**')
    if (open === -1) {
      nodes.push(...linkNames(rest, links, `${key}-t${count}`))
    } else {
      nodes.push(...linkNames(rest.slice(0, open), links, `${key}-t${count}`))
      nodes.push(
        <strong key={`${key}-open`} className="font-semibold text-ink">
          {linkNames(rest.slice(open + 2), links, `${key}-o${count}`)}
        </strong>,
      )
    }
  }
  return nodes
}

export interface ChatMarkdownProps {
  text: string
  /** Candidate names to link; the answer mentions them by full name. */
  links?: NameLink[]
  /** Rendered after the last character (the streaming caret). */
  trailing?: ReactNode
  className?: string
}

/**
 * Renders an assistant answer: paragraphs, headings, bullet and numbered lists,
 * bold, italic and inline code, with every cited candidate's name linked to
 * their page. Tolerant of unfinished markdown, so it re-renders on every
 * streamed piece without flicker.
 */
export function ChatMarkdown({ text, links, trailing, className }: ChatMarkdownProps) {
  const blocks = parseBlocks(text)
  if (blocks.length === 0) return trailing ? <p className={className}>{trailing}</p> : null
  return (
    <div data-slot="chat-markdown" className={cn('space-y-2.5', className)}>
      {blocks.map((block, index) => {
        const tail = index === blocks.length - 1 ? trailing : null
        if (block.kind === 'heading') {
          return (
            <p key={index} className="font-heading text-[14px] font-semibold text-ink">
              {renderInline(block.text, links, `h${index}`)}
              {tail}
            </p>
          )
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag
              key={index}
              className={cn(
                'space-y-1 pl-5 marker:text-ink-subtle',
                block.ordered ? 'list-decimal' : 'list-disc',
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  {renderInline(item, links, `l${index}-${itemIndex}`)}
                  {itemIndex === block.items.length - 1 ? tail : null}
                </li>
              ))}
            </Tag>
          )
        }
        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, links, `p${index}-${lineIndex}`)}
              </Fragment>
            ))}
            {tail}
          </p>
        )
      })}
    </div>
  )
}
