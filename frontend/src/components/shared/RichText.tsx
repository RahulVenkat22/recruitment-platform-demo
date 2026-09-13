import { Fragment } from 'react'
import { parseBlocks } from '@/lib/rich-text'
import { cn } from '@/lib/utils'

export interface RichTextProps {
  text: string | null | undefined
  emptyLabel?: string
  className?: string
}

/** Paragraphs, headings and bullet lists from plain text; used by the JD overview and preview. */
export function RichText({ text, emptyLabel = 'Nothing written yet.', className }: RichTextProps) {
  const blocks = parseBlocks(text ?? '')
  if (blocks.length === 0) {
    return <p className={cn('text-small text-ink-subtle', className)}>{emptyLabel}</p>
  }
  return (
    <div data-slot="rich-text" className={cn('space-y-3 text-body text-ink', className)}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Tag = block.level === 2 ? 'h3' : 'h4'
          return (
            <Tag
              key={index}
              className={block.level === 2 ? 'pt-1 text-h3' : 'text-[15px] font-medium'}
            >
              {block.text}
            </Tag>
          )
        }
        if (block.kind === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5 marker:text-ink-subtle">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={index} className="leading-6">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
